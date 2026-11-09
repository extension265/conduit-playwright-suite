# GSP — test automation strategy

How I would approach automation for GSP, using what I built and learned on Conduit in Part 1.

## 1. Coverage first: the first 10 journeys

**Ordering logic.** I rank each journey on three things and take the highest scores first:
- **Damage if it breaks silently.** Data exposure, compliance (visa/CAS deadlines), or money. These are the bugs that can't be undone on Monday.
- **Usage frequency.** How many staff and agents hit it every day.
- **Config sensitivity.** How much of its behaviour comes from admin-editable configuration rather than code.
  In GSP a config edit can break a workflow as easily as a deploy, so config-driven paths need tests that run **when config changes**, not only when code does.

| # | Journey | Why it's here |
|---|---|---|
| 1 | **Agent data isolation**: an agent sees only their own students in list, search, detail, documents and export | Leaking one agency's students to another is a privacy and contractual incident. Cheap to test at API level, so it goes first |
| 2 | **Enquiry → application created** (staff and agent entry points) | Top of the funnel and the highest-volume write. If it breaks, nothing downstream happens |
| 3 | **Document upload against the market checklist → completeness status**, data-driven across all 9 markets | The most config-sensitive journey. One test per market, generated from the market's config |
| 4 | **Stage progression with gates**: application → submitted → offer (conditional / unconditional) | The core pipeline. Gates encode business rules (e.g. "can't submit until mandatory docs are verified") |
| 5 | **Offer → CAS / visa stage**: the gate requires a complete, verified checklist | Deadline-driven and compliance-heavy. A wrong gate either blocks real students or lets incomplete files through |
| 6 | **Enrolment confirmed → agent commission calculated from the rate card** | Money. Rate cards are config. Assert the computed amount for a few rate-card shapes (flat, %, tiered) |
| 7 | **Staff document review**: verify or reject a document, the reason reaches the agent, and the status rolls up to the application | Daily high-volume staff work. It drives journeys 4–5 |
| 8 | **Admin config change → in-flight applications** (checklist edit, stage rule edit) behave per policy | See section 3. The "Friday" journey |
| 9 | **Role-restricted actions**: e.g. an agent cannot move a stage, edit commission or see internal notes; staff cannot edit rate cards | The action half of the permission model (journey 1 is the visibility half) |
| 10 | **Sign-in, session expiry and password reset** for each role | Everything depends on it, but it rarely regresses and is cheap. A smoke test, not deep coverage |

As in Part 1, each of these is mostly **API tests with API-seeded data**, plus one thin UI journey per flow to prove the screens are wired up.
The end-to-end "lead to enrolment" UI test is the GSP equivalent of my Conduit article lifecycle test: a few, long, high-value steps.

## 2. Provably safe permissions

**Goal:** a permission regression fails CI, and so does *forgetting to define the permission* for a new endpoint or role.

**Model.** Every check is one row: `role × resource × action × ownership scope → expected outcome`. Scope matters more than role.
"Agent reads a student" is meaningless without "their own student or another agent's".

**Implementation.**
1. **The matrix is data.** A versioned file (`permissions.matrix.json`), reviewed like code, lists every row and its expected outcome.
2. **Data-driven API tests.** One generated test per row. Seed (through the API, as in Part 1) Admin, Staff, Agent A and Agent B, each agent with their own student
   and application. Then fire the request with the role's token and assert the **status and the payload**.
3. **Deny by default, with a completeness check.** A meta-test lists all routes from the app (the Express router stack or the OpenAPI spec) and all roles from
   the role enum, and **fails if any (route, role) pair has no matrix row**. A new endpoint or role cannot merge until someone decides who may use it.
4. **Assert filtering, not just blocking.** List, search, report and **CSV export** endpoints usually return 200 to everyone. The bug is *what's in them*.
   The test asserts that every returned student ID belongs to the caller's agency, and that Agent B's seeded student is absent.
5. **Direct-ID access (IDOR).** Agent A requests Agent B's student, application and document by ID, across every HTTP verb.
   The expected result is **404** (not 403, so the record's existence isn't leaked), followed by a re-read as the owner to prove nothing changed. That is exactly my Part 1 pattern:
   B's PUT/DELETE got 403 and A's GET showed the article unchanged.
6. **The UI is secondary.** A few UI tests check that hidden controls are hidden, but like the Conduit editor redirect, that's a client-side courtesy. The API matrix is the proof.
7. Runs on **every PR**. It's pure HTTP, so a few hundred rows run in parallel in well under a minute.

**Sample matrix** (✅ allowed, 🔒 404 not visible, ⛔ 403 visible but not allowed, F = 200 but filtered to own records):

| Resource / action | Admin | Staff | Agent (own student) | Agent (other agent's student) |
|---|---|---|---|---|
| Student: view by ID | ✅ | ✅ | ✅ | 🔒 |
| Student: list / search | ✅ all | ✅ all | F | absent from results |
| Applications: export CSV | ✅ | ✅ | F | absent from file |
| Application: move stage | ✅ | ✅ | ⛔ | 🔒 |
| Document: upload | ✅ | ✅ | ✅ | 🔒 |
| Document: verify / reject | ✅ | ✅ | ⛔ | 🔒 |
| Commission: view | ✅ all | ✅ all | own only | 🔒 |
| Rate card / checklist config: edit | ✅ | ⛔ | ⛔ | ⛔ |
| Internal notes: read | ✅ | ✅ | ⛔ (field absent from payload) | 🔒 |

## 3. The Friday 5pm change to Canada's checklist

**What can break**
- **In-flight applications fail validation.** A newly *mandatory* document makes every Canadian application past the document stage "incomplete".
  The stage gate then **blocks progression to offer and visa**, and on Monday staff can't move students who have real deadlines.
- **Documents seem to disappear.** If a document type is removed, or renamed under a new key, files already uploaded against it are orphaned. Staff and agent views
  stop showing them, or the "complete" calculation ignores them.
- **Compliance holes.** Removing or relaxing a required document lets incomplete files reach the visa stage.
- **Other markets change.** If checklists inherit from a shared base template or reuse document-type definitions, a Canada edit can silently alter the other 8 markets.
- **Agent-facing effects.** Agents see new red "missing document" flags with no context, notifications fan out, and dashboards and stage counts jump.
- **Downstream logic.** Commission or reporting rules tied to stage dates shift, because applications stall.
- **Bad config crashes screens.** A malformed rule (wrong type, a reference to a missing document type) can throw for every Canadian application.

**How automation catches it before Monday**
1. **Validate on save.** The checklist is validated against a schema plus reference checks before it is accepted: every document type exists, and every stage gate
   references only valid document types.
2. **Impact dry-run on save.** Before publishing, run the new rule against current in-flight Canadian applications and report "*N applications would become incomplete,
   M would be blocked at the visa gate*". Above a threshold, require a second approver.
3. **Config-driven invariant tests, triggered by the config save** (webhook → CI) **and on a schedule over the weekend** (e.g. Fri 8pm, Sat, Sun) against staging
   with fresh, anonymised prod-like data. The tests are generated from the *live* config, so they follow whatever the admin changed:
   - for each market, a synthetic application walks enquiry → enrolment uploading exactly the documents the config requires (journey 3–6);
   - no previously complete in-flight application has become incomplete, unless the change was marked "applies to new applications only";
   - every uploaded document is still visible in staff and agent views.
4. **Config snapshot diff.** Every night, export all market configs to a git repo. Any diff posts to Slack with who changed what and when.
   Unchanged markets must have byte-identical snapshots, which catches the shared-config bleed.
5. **Read-only synthetic monitoring in prod.** A canary agent account loads a test Canadian application every hour and checks the checklist renders and the gate state is sane.
6. **Recovery.** Audit log plus versioned config plus one-click rollback means a failure at 9pm Friday is a revert, not an incident. Longer term,
   **effective-dated config** (a change applies only to applications created after a date) removes most of this risk by design.

## 4. Keeping a data-heavy SPA suite fast and non-flaky

What I'd carry over from Part 1, and what I'd add for GSP:

1. **Seed through the API, test through the UI.** Conduit fixtures create users and articles in ~300 ms each. Clicking through the editor would cost ~10 s and add failure points.
   For GSP: factories that create a student with an application at any given stage, so a visa-stage test doesn't replay ten earlier stages.
2. **Every test owns its data.** Unique IDs per test, no shared users and no test ordering. Cleanup is keyed by owner rather than by ID (in Part 1, renaming an article changed its slug,
   so "delete what I created" would have leaked data). Tests never assert on global lists or counts. They search by their own unique ID.
3. **Wait for state, never for time.** No sleeps. Use web-first assertions and `waitForResponse` on the specific call. Two Part 1 examples:
   the editor renders empty and fills in asynchronously, so the test waits for the prefilled title before typing; and before asserting "no Edit button",
   the test waits for a positive signal of the logged-in view, so an absence check can't pass on a half-rendered page.
4. **Stable locators.** Roles and labels first. Since we own GSP's front end, add `data-testid` on dense tables and grids where text isn't unique.
   Conduit has none, which is why three of my locators fall back to CSS.
5. **Retries for diagnosis, not for green.** One retry in CI, with the trace recorded on that retry. A pass-on-retry is reported as *flaky* and tracked.
   Persistent flakes go to a **quarantine** tag that runs in a non-blocking job with a named owner and a fix-by date, so we never bump retries or timeouts for the whole suite.
6. **Parallel by default, sharded when it grows.** `fullyParallel` is safe only because of point 2. Shard across CI machines and merge the reports.
   Keep the pyramid: most coverage in fast API tests (permissions, gates, config invariants), and a thin layer of UI journeys.
7. **Control the environment.** The biggest flakiness source in Part 1 is the shared public server. For GSP: an ephemeral environment per PR with a seeded database,
   and third parties (email, payment, university portals) stubbed at the network boundary.
8. **Make failures cheap to debug.** Trace on retry, screenshots and video on failure, and HTML reports as CI artifacts, so a red build can be diagnosed from the artifact without a re-run.
