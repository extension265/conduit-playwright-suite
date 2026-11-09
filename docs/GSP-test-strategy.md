# GSP — test automation strategy

## 1. Coverage first: the first 10 journeys

**Ordering logic:** *damage if it breaks silently* (data exposure, visa compliance, money) × *daily usage* × *config sensitivity*
(how much behaviour comes from admin-editable config). Config-driven journeys need tests that run when **config** changes, not only when code does.

| # | Journey | Why it's here |
|---|---|---|
| 1 | **Agent data isolation**: list, search, detail, documents and export show only the agent's own students | A cross-agency leak is a privacy and contractual incident. Cheap to test at API level |
| 2 | **Enquiry → application created** (staff and agent) | Top of the funnel and the highest-volume write |
| 3 | **Document upload vs market checklist → completeness**, generated for all 9 markets | The most config-sensitive journey |
| 4 | **Stage gates**: application → submitted → offer | Gates encode the core business rules |
| 5 | **Offer → CAS / visa**: gate needs a complete, verified checklist | Deadline-driven compliance. A wrong gate blocks students or lets bad files through |
| 6 | **Enrolment → agent commission from the rate card** | Money, and rate cards are config. Assert amounts for flat, % and tiered cards |
| 7 | **Staff document review**: verify or reject, the reason reaches the agent, status rolls up | Daily staff work that feeds journeys 4–5 |
| 8 | **Admin config change → in-flight applications** behave per policy | The "Friday" journey (section 3) |
| 9 | **Role-restricted actions**: agent can't move stages, edit commission or read internal notes | The action half of permissions (journey 1 is visibility) |
| 10 | **Sign-in, session expiry, password reset** for each role | Everything depends on it, but it rarely regresses. A smoke test |

Most coverage is API tests with API-seeded data, plus one thin UI journey per flow. That is the same split as my Conduit suite.

## 2. Provably safe permissions

**Goal:** a permission regression fails CI, and so does *forgetting to define* the permission for a new endpoint or role.

1. **The matrix is data.** A reviewed file lists `role × resource × action × scope (own / other agent's) → expected outcome`.
   Scope matters as much as role.
2. **Data-driven API tests.** One generated test per row. Seed Admin, Staff, Agent A and Agent B (each agent with their own student) through the API,
   call with the role's token, and assert status **and** payload.
3. **Deny by default.** A meta-test reads all routes (Express router or OpenAPI spec) and all roles, and **fails if any (route, role) pair has no matrix row**.
   A new endpoint or role can't merge until someone decides who may use it.
4. **Assert filtering, not just blocking.** List, search and **CSV export** usually return 200 to everyone. The bug is *what's in them*.
   Assert that every returned ID belongs to the caller's agency, and that Agent B's student is absent.
5. **Direct-ID access (IDOR).** Agent A requests Agent B's student, application and document by ID with every verb, then the owner re-reads the record to prove it is unchanged.
   This is the same reject-then-re-read-as-owner pattern as Part 1, where Conduit returned **403** to B's PUT and DELETE.
   For GSP I'd specify **404** instead, so a rejection doesn't reveal that the record exists.
6. **UI is secondary.** Hidden controls are a courtesy, like Conduit's client-side redirect. The API matrix is the proof, and as pure HTTP it runs on every PR in under a minute.

**Sample matrix** (✅ allowed, 🔒 404, ⛔ 403, F = 200 filtered to own records):

| Resource / action | Admin | Staff | Agent, own student | Agent, other's student |
|---|---|---|---|---|
| Student: view by ID | ✅ | ✅ | ✅ | 🔒 |
| Student: list / search | ✅ all | ✅ all | F | absent |
| Applications: export CSV | ✅ | ✅ | F | absent from file |
| Application: move stage | ✅ | ✅ | ⛔ | 🔒 |
| Document: upload | ✅ | ✅ | ✅ | 🔒 |
| Document: verify / reject | ✅ | ✅ | ⛔ | 🔒 |
| Commission: view | ✅ | ✅ | own only | 🔒 |
| Checklist / rate card: edit | ✅ | ⛔ | ⛔ | ⛔ |
| Internal notes: read | ✅ | ✅ | field absent | 🔒 |

## 3. The Friday 5pm change to Canada's checklist

**What can break**
- **In-flight applications fail validation.** A new mandatory document makes Canadian applications past the document stage "incomplete".
  Gates then block offer and visa progress, and on Monday staff can't move students who have real deadlines.
- **Documents seem to disappear.** If a document type is removed or re-keyed, existing uploads are orphaned: hidden from staff and agents, or ignored by the completeness check.
- **Compliance holes.** A relaxed requirement lets incomplete files reach the visa stage.
- **Other markets change.** If checklists share a base template or document-type definitions, the other 8 markets change silently.
- **Knock-on effects.** Agents get unexplained "missing document" flags and notification storms; commission timing slips with stalled stages.
- **Malformed config** crashes screens for every Canadian application.

**How automation catches it before Monday**
1. **Validate on save.** Schema plus reference checks: every document type exists, and every gate references valid types.
2. **Impact dry-run on save.** Report "*N in-flight applications would become incomplete, M blocked at the visa gate*", and require a second approver above a threshold.
3. **Config-driven invariant tests**, triggered by the config save and run on a schedule over the weekend against staging with anonymised prod-like data.
   They are generated from the *live* config:
   - for each market, a synthetic application walks enquiry → enrolment uploading exactly the documents the config requires;
   - no previously complete application has become incomplete (unless the change applies to new applications only);
   - every existing upload is still visible to staff and agents.
4. **Nightly config snapshot diff** into git, alerting Slack with who changed what. The 8 unchanged markets must have identical snapshots, which catches shared-config bleed.
5. **Read-only prod canary.** Every hour, a test agent account opens a test Canadian application and checks the checklist and gate state.
6. **Recovery.** Audit log, versioned config and one-click rollback. Longer term, **effective-dated config** (rules apply only to new applications) removes most of this risk by design.

## 4. Keeping a data-heavy SPA suite fast and non-flaky

1. **Seed through the API, test through the UI.** Conduit fixtures create data in ~300 ms, versus ~10 s through the editor.
   For GSP: factories that create an application at any stage, so a visa test doesn't replay ten earlier stages.
2. **Every test owns its data.** Unique IDs, no shared users, no ordering. Clean up by owner, not by ID: on Conduit, a rename changes the slug, so "delete what I created" leaked data.
   Search by your own ID and never assert on global lists or counts.
3. **Wait for state, never time.** Use auto-retrying assertions and `waitForResponse`. On Conduit, the edit form fills in asynchronously, so the test waits for the prefilled title;
   and absence checks run only after a positive signal (B's "Follow" button) shows the page has rendered.
4. **Stable locators.** Roles and labels first, plus `data-testid` on dense GSP grids, since we own the front end.
5. **Retries for diagnosis, not green.** One CI retry that records a trace, with screenshots, video and the HTML report kept as artifacts. Track pass-on-retry as flaky,
   and quarantine persistent flakes in a non-blocking job with an owner and a deadline, instead of raising retries or timeouts for everyone.
6. **Parallel and sharded.** `fullyParallel` is safe because of point 2. Shard across CI machines as the suite grows.
7. **Control the environment.** The shared public server is Part 1's main flakiness risk. For GSP: an ephemeral environment per PR with seeded data, and third parties stubbed.
