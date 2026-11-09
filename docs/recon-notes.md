# Recon notes — live Conduit instance

Probed on 2026-11-09 with Node `fetch` scripts and Playwright (Chrome) against the live instance.
Where the live app differs from the RealWorld spec, **the live behaviour wins** and is what the suite asserts.

## 1. Base URLs and auth

| Item | Value |
|---|---|
| UI | `https://conduit.bondaracademy.com` (Angular SPA, path routing, lazy-loaded chunks) |
| API | `https://conduit-api.bondaracademy.com/api` (found in the app bundle; Express on Fly.io) |
| Auth header | `Authorization: Token <jwt>` (**Token**, not Bearer; confirmed in the bundle's HTTP interceptor) |
| JWT storage | `window.localStorage.jwtToken` (the only key the app writes) |

On boot with `jwtToken` set, the app calls `GET /user` and renders the logged-in nav. So putting the token into
localStorage before the page loads (`addInitScript`) is enough to be "logged in" with no UI login.

## 2. Request/response shapes and status codes

| Call | Status | Response body (shape) |
|---|---|---|
| `POST /users` `{user:{username,email,password}}` | **201** | `{user:{id,email,username,bio:null,image,token}}` |
| `POST /users/login` `{user:{email,password}}` | **200** | `{user:{email,username,bio,image,token}}` |
| login, wrong password | **403** (spec says 422) | `{errors:{"email or password":["is invalid"]}}` |
| `GET /user` (with token) | 200 | `{user:{...,token}}` |
| `POST /articles` `{article:{title,description,body,tagList}}` | **201** | `{article:{slug,title,description,body,tagList,createdAt,updatedAt,favorited,favoritesCount,author:{username,bio,image,following}}}` |
| `POST /articles`, no token | **401** | `{status:"error",message:"missing authorization credentials"}` |
| `GET /articles/:slug` (anon OK) | 200 | `{article:{...}}` |
| `PUT /articles/:slug` (author) | **200** | `{article:{...}}` with the updated fields |
| `DELETE /articles/:slug` (author) | **204** | empty body |
| `GET` deleted / unknown slug | **404** | `{errors:{article:["not found"]}}` |
| `DELETE` an already-deleted slug | 404 | `{}` |

### Behaviour that differs from the spec (tests must handle it)
- **Slug format** `Title-words-<authorUserId>`, e.g. `Recon-mw8svqq0xk2n-90867`.
- **Changing the title changes the slug.** The old slug then returns 404. After an update, always use the slug from the PUT response.
- **Duplicate title, same author → 422** `{errors:{title:["must be unique"]}}`. Titles must be unique per run.
- **Tags are normalised on the server**: lowercased, case-insensitively merged with existing global tags
  (`qa` → `QA`, `test` → `Test`, `Zeta` → `zeta`), and returned in **no guaranteed order**.
  → Tests use unique lowercase tags (e.g. `t<id>`) and compare tag lists as sorted arrays.
- **A partial PUT without `tagList` wipes the tags to `[]`.** (`PUT {article:{body}}` → `tagList: []`.) This is a real server bug or quirk.
  The UI editor always sends `tagList`, so the UI flow is not affected. API tests send `tagList` on update, and the README documents the quirk.
- **`GET /articles?author=<username>` returns `[]` to anonymous callers.** With a token it returns the author's articles.
  (Found by a fixture smoke test.) The cleanup sweep therefore lists the user's articles with that user's own token.

## 3. Cross-user writes (permission check)

User B (valid token) against user A's article:

| Action | Status | Body |
|---|---|---|
| `PUT /articles/:slug` as B | **403** | `{message:"You are not authorized to update this article"}` |
| `DELETE /articles/:slug` as B | **403** | `{message:"You are not authorized to delete this article"}` |
| `DELETE` with no token | 401 | `{status:"error",message:"missing authorization credentials"}` |

Afterwards, `GET` as A returned 200 with the title, body and `updatedAt` unchanged.

UI as user B:
- On A's article page there is **no** "Edit Article" link and **no** "Delete Article" button. B sees "Follow <author>" and "Favorite Article (n)" instead.
- Going straight to `/editor/<A's slug>` **redirects B to `/`** (client-side guard). The editor form never renders, so B has nothing to save.
  The UI test asserts the redirect and that no "Publish Article" button appears, then confirms through the API that the article is unchanged.

## 4. Register validation errors

| Case | Status | Body |
|---|---|---|
| duplicate email | **422** | `{errors:{email:["has already been taken"]}}` |
| duplicate username | **422** | `{errors:{username:["has already been taken"]}}` |
| blank fields | 422 | `{errors:{email:["can't be blank"],username:[...],password:[...]}}` |

In the UI, the error renders as `<ul class="error-messages"><li>email has already been taken</li></ul>`
(a role `list` with a `listitem`, text = `<field> <message>`).

## 5. JWT in the browser
`localStorage.jwtToken`. Injected with `context.addInitScript(t => localStorage.setItem('jwtToken', t), token)`.

## 6. Locators

The app has **no `data-test` attributes**, but its roles and placeholders are good enough that no CSS fallback is needed except where noted.

| Page | Element | Locator |
|---|---|---|
| Nav (logged out) | Sign in / Sign up | `getByRole('link', {name:'Sign in'})` / `{name:'Sign up'}` |
| Nav (logged in) | user link | `getByRole('link', {name: username})` (href `/profile/<username>`) |
| Nav (logged in) | New Article | `getByRole('link', {name:'New Article'})` (text has a leading icon glyph, so substring match) |
| `/register` | heading | `getByRole('heading', {name:'Sign up'})` |
| | fields | `getByPlaceholder('Username' / 'Email' / 'Password')` |
| | submit | `getByRole('button', {name:'Sign up'})` (disabled until the form is valid) |
| | errors | `.error-messages li` (**CSS fallback**, since the list has no accessible name) |
| `/login` | fields/submit | `getByPlaceholder('Email' / 'Password')`, `getByRole('button', {name:'Sign in'})` |
| `/editor` | fields | `getByPlaceholder('Article Title')`, `("What's this article about?")`, `('Write your article (in markdown)')`, `('Enter tags')` (press Enter to add each tag) |
| | submit | `getByRole('button', {name:'Publish Article'})` |
| `/article/:slug` | title | `getByRole('heading', {level:1})` |
| | body | `.article-content` (**CSS fallback**; body is rendered markdown with no landmark) |
| | tags | `.article-content .tag-list li` (**CSS fallback**) |
| | edit / delete | `getByRole('link', {name:'Edit Article'})` / `getByRole('button', {name:'Delete Article'})`. **Each appears twice** (banner and footer meta), so use `.first()` |

### Timing traps
- On `/editor/<slug>` the inputs render **empty**, then fill in when `GET /articles/:slug` resolves.
  Typing before that races the prefill. The edit flow waits for `expect(title).toHaveValue(original)` first.
- After sign-up or delete, the home page shows "Loading articles..." while the feed loads. Don't assert on feed contents.
- Creating an article: `POST /articles/` (trailing slash), then navigation to `/article/<slug>`.

## 7. Rate limiting and speed
- No rate-limit headers (`x-ratelimit-*`, `retry-after`) on any response. A burst of 20 parallel GETs returned 20× 200 in ~1.2 s.
- Typical API latency from India: 250–800 ms per call (Fly.io, `sin` region). First page load ~2 s.
- It is a **shared public instance**: global feed and tags contain other people's data, so tests never assert on global lists.

## 8. Local environment note
On this Windows machine, **Smart App Control / WDAC blocks the freshly downloaded Playwright Chromium binary**
("An Application Control policy has blocked this file"). The installed Google Chrome works.
Locally the suite can run with `PW_CHANNEL=chrome`. CI (Ubuntu) uses Playwright's bundled Chromium.
