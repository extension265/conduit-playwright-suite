# Conduit Playwright Suite

[![Playwright tests](https://github.com/extension265/conduit-playwright-suite/actions/workflows/playwright.yml/badge.svg)](https://github.com/extension265/conduit-playwright-suite/actions/workflows/playwright.yml)

A small automated test suite for [Conduit](https://conduit.bondaracademy.com), the RealWorld demo app (an Angular SPA over a REST API),
written with **Playwright + JavaScript (CommonJS)**. It covers sign-up, sign-in, the full article lifecycle, a cross-user
permission check, and API-level CRUD. All test data is created through the API, and every test is independent.

- Part 2 (GSP test strategy): [docs/GSP-test-strategy.md](docs/GSP-test-strategy.md)
- What the live instance actually does (status codes, quirks, locators): [docs/recon-notes.md](docs/recon-notes.md)

## Running locally

Requires Node 20+ (CI uses Node 24 LTS).

```bash
npm ci
npx playwright install chromium     # skip if you only use test:local (see below)

npm test                                          # whole suite, Playwright's bundled Chromium (what CI runs)
npm run test:local                                # whole suite, your installed Google Chrome
npm run test:api                                  # API tests only (no browser)
npx playwright test tests/e2e/signup.spec.js      # one file
npx playwright test -g "article lifecycle"        # tests whose title matches
npx playwright test --repeat-each=3 --workers=4   # flakiness check
npm run test:ui                                   # Playwright UI mode (watch, time-travel, pick locators)
npm run report                                    # open the last HTML report
npx playwright show-trace test-results/<test-folder>/trace.zip
```

**Why `test:local` exists.** On my Windows machine, Smart App Control blocks the Chromium binary that Playwright downloads
("An Application Control policy has blocked this file"). `test:local` sets `PW_CHANNEL=chrome` (through `cross-env`, so it
works on Windows), which makes Playwright drive the installed, signed Google Chrome instead. CI leaves `PW_CHANNEL` unset and
runs Playwright's own Chromium. Same engine, same tests.

**Traces locally:** traces are recorded on the first retry, and local runs have no retries. To get one for a local failure,
add `--trace on`.

**Pointing elsewhere:** `UI_URL` and `API_URL` env vars override the defaults in [utils/env.js](utils/env.js), e.g. for a
self-hosted RealWorld backend.

## How the suite is organised

```
playwright.config.js     two projects: "api" (no browser) and "chromium" (e2e + permissions)
utils/env.js             UI and API base URLs
utils/api-client.js      thin wrapper over Playwright's request context; returns raw responses
utils/data-factory.js    unique users and articles (base-36 timestamp + random suffix)
fixtures/index.js        shared fixtures (below) + loginViaStorage helper
pages/                   HomePage, AuthPage, EditorPage, ArticlePage, ProfilePage: locators and actions, no assertions
tests/api/               auth.api.spec.js, articles.api.spec.js
tests/e2e/               signup.spec.js, signin.spec.js, article-lifecycle.spec.js
tests/permissions/       cross-user.spec.js
.github/workflows/       CI on every push and pull request
```

| Spec | Tests | What it proves |
|---|---|---|
| `api/auth.api.spec.js` | 3 | register → 201 + user + JWT; login → 200 + a token that actually authorises a write; taken email/username → 422 with the exact field error |
| `api/articles.api.spec.js` | 1 (4 steps) | create (all fields, author, slug format) → get → update (fresh GET shows the change; old slug 404s) → delete 204 → GET 404 |
| `e2e/signup.spec.js` | 2 | UI sign-up logs you in and stores **the token the server issued**; a taken email shows "email has already been taken" and stores no token |
| `e2e/signin.spec.js` | 1 | a user created through the API can sign in through the UI |
| `e2e/article-lifecycle.spec.js` | 1 (6 steps) | create in the editor → rendered title/body/tags/author → edit → UI **and** API show the change → delete → gone from profile, URL redirects, API 404 |
| `permissions/cross-user.spec.js` | 2 | B cannot update or delete A's article (API 403, article untouched); B sees no Edit/Delete controls and is bounced from `/editor/<slug>` |

### Fixtures and why each exists

| Fixture | What it gives the test | Why |
|---|---|---|
| `apiClient` | `ApiClient` on the test's request context | one place for URLs and the `Token <jwt>` header |
| `newUser` | a freshly registered user `{username, email, password, token}` | every test owns its data. **Teardown deletes every article the user still owns** |
| `otherUser` | a second, unrelated user | "user B" for permission tests |
| `authedPage` | a page already logged in as `newUser` | the JWT goes into `localStorage.jwtToken` through `addInitScript` before the app boots, so no UI login is needed outside the sign-in tests |
| `article` | an article owned by `newUser`, created through the API | tests that need an existing article don't click through the editor |

Page objects hold locators and actions only. The one exception is `EditorPage.waitForPrefill`, which uses `expect` purely as a
wait: on `/editor/<slug>` the form renders empty and fills in when the article request returns, and typing earlier would race it.

## Test-data strategy

- **State through the API, never the UI.** Users and articles that a test needs are created with API calls in fixtures (~300 ms each).
  The UI only drives the behaviour under test.
- **Unique everything.** Usernames, emails, titles and tags all carry a fresh `uniqueId()`, so tests can run in any order, in parallel,
  repeatedly, and alongside other people using the public instance. Titles have to be unique per author anyway (the server returns 422 otherwise).
- **No shared state between tests.** There are no global setup users and no test ordering. Any spec runs alone (`npx playwright test <file>`).
- **Cleanup by owner, not by slug.** `newUser`'s teardown lists the user's articles and deletes each one, accepting 204 or 404.
  I chose this over "delete the slug I created" because renaming an article changes its slug, and articles created through the UI
  never pass through a fixture. The sweep catches both. (The live API only answers `?author=` for authenticated callers, so the sweep uses the owner's token.)
- **No sleeps.** Waiting relies on web-first assertions (`toHaveURL`, `toHaveText`, `toHaveCount`) and `waitForResponse` on the specific save or delete call.
  `grep -r waitForTimeout` finds nothing.

## Permission test approach

User A owns an article (created through the API). User B is a different, valid user.

1. **API, the authoritative proof.** With B's token, `PUT` and `DELETE` on A's article both return **403**
   (`{"message":"You are not authorized to update this article"}` and the delete equivalent). A then re-reads the article:
   it still exists (200), and title, description, body, tags, author and even `updatedAt` are unchanged.
2. **UI, the user experience.** Logged in as B (token injection), A's article page shows no "Edit Article" link and no
   "Delete Article" button. The test first waits for B's "Follow <A>" button, so the absence check runs on a fully rendered
   logged-in page. Opening `/editor/<slug>` directly redirects B to `/` and the form never renders. A then re-reads through the API to confirm nothing changed.

**The UI redirect is a client-side guard only.** Anyone can call the API directly, so the UI test proves B isn't *offered* the
action, while the API test proves B *can't do* it. If I could keep only one, I'd keep the API test.

Both tests were checked by breaking them: logging the UI test in as A (the owner) makes it fail with
`Expected: 0, Received: 2` Edit links.

Observed status codes (full table in [docs/recon-notes.md](docs/recon-notes.md)): register 201, login 200 (wrong password **403**, not the spec's 422),
create 201, get 200, update 200, delete **204**, deleted/unknown article 404, duplicate email/username 422,
cross-user update/delete **403**, no token 401.

## CI

[.github/workflows/playwright.yml](.github/workflows/playwright.yml) runs on every push and pull request (and manually):
checkout → Node 24 with npm cache → `npm ci` → `npx playwright install --with-deps chromium` → `npm test`.
The HTML report (`playwright-report`) and raw results (`test-results`: traces, screenshots and videos of failures) are uploaded
as artifacts even when tests fail. CI uses 1 retry, 2 workers and `forbidOnly`. `@playwright/test` is pinned to exactly `1.65.0`
and `package-lock.json` is committed, so CI and local runs use the same version.

## Known limitations

- **Shared public instance.** The suite depends on a demo server I don't control. An outage or slowdown turns the build red without
  any bug in the code under test. Other people's data is visible, so no test asserts on global lists (feed, popular tags).
- **Leftovers.** Conduit has no delete-user endpoint, so every run leaves a few throwaway accounts behind. Articles are cleaned up in
  teardown, but if a run is killed mid-test (Ctrl+C, CI cancel), teardown doesn't run and those articles stay.
- **Chromium only.** No Firefox, WebKit or mobile viewport runs yet.
- **Live API quirks the tests rely on** (all in the recon notes): a title edit changes the slug; tags are normalised and unordered
  (tests compare them sorted); **a `PUT` without `tagList` wipes the tags** (looks like a server bug; the API test sends `tagList`,
  and the UI always does); `?author=` returns nothing to anonymous callers.
- **No test IDs in the app.** Locators use roles and placeholders. Three use CSS because the markup has no accessible handle:
  the error list, the article body, and the article's tags.
- **Payload checks are partial.** `toMatchObject` checks the fields that matter, not the full schema.
- The API half of the permission test lives in `tests/permissions/`, so it reports under the `chromium` project. It launches no browser.

## With one more day

1. **Self-hosted backend in CI** (RealWorld API + DB in a service container) for determinism, speed and a clean DB per run. This removes the biggest flakiness source.
2. **Schema/contract validation** of API responses (e.g. with Ajv against the RealWorld OpenAPI spec), so an extra, missing or retyped field fails.
3. **Cross-browser** projects (Firefox, WebKit) and one mobile viewport.
4. **Sharding** (`--shard=1/3` across a matrix job) and merging blob reports, once the suite grows.
5. **Cleanup job**: a scheduled workflow that deletes articles from `qa*` users older than a day, to cover aborted runs.
6. **Visual checks** on the article page and editor with `toHaveScreenshot`, against the self-hosted, deterministic data.
7. More negatives worth having: wrong-password login (403), anonymous write (401), blank-field validation, and comments permissions.

## Time spent

| Part | Time |
|---|---|
| Recon (API + UI behaviour, locators) | _fill in_ |
| Part 1: suite, CI, README | _fill in_ |
| Part 2: GSP write-up | _fill in_ |
| **Total** | _fill in_ |

Built with AI assistance (Claude). Every behaviour the tests assert was verified against the live instance first.
