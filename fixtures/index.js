const base = require('@playwright/test');
const { ApiClient } = require('../utils/api-client');
const { buildUser, buildArticle } = require('../utils/data-factory');

const { expect } = base;

// Registers a brand-new user through the API and returns { username, email, password, token }.
async function registerUser(apiClient) {
  const data = buildUser();
  const res = await apiClient.register(data);
  expect(res.status(), `register ${data.username}`).toBe(201);
  const { user } = await res.json();
  return { ...data, token: user.token };
}

// Deletes every article the user still owns. It runs as teardown, so tests leave nothing behind
// even when they rename an article (a new title means a new slug) or create one through the UI.
// A 404 just means the test already deleted it, which is fine.
async function deleteAllArticlesOf(apiClient, user) {
  const res = await apiClient.listArticlesByAuthor(user.token, user.username);
  if (!res.ok()) return;
  const { articles } = await res.json();
  for (const { slug } of articles) {
    const del = await apiClient.deleteArticle(user.token, slug);
    expect([204, 404], `cleanup delete ${slug}`).toContain(del.status());
  }
}

// Makes the Angular app treat the page as logged in, without the login screen.
// The app reads the JWT from localStorage.jwtToken at startup (verified in recon).
// addInitScript runs before any page script, so the token is there on the very first load.
async function loginViaStorage(page, token) {
  await page.context().addInitScript((jwt) => {
    window.localStorage.setItem('jwtToken', jwt);
  }, token);
}

const test = base.test.extend({
  // API helper bound to this test's request context.
  apiClient: async ({ request }, use) => {
    await use(new ApiClient(request));
  },

  // "User A": a fresh user per test. Teardown removes any articles they own.
  newUser: async ({ apiClient }, use) => {
    const user = await registerUser(apiClient);
    await use(user);
    await deleteAllArticlesOf(apiClient, user);
  },

  // "User B": a second, independent user, for the cross-user permission tests.
  otherUser: async ({ apiClient }, use) => {
    const user = await registerUser(apiClient);
    await use(user);
    await deleteAllArticlesOf(apiClient, user);
  },

  // A browser page already logged in as newUser (token injected, no UI login).
  authedPage: async ({ page, newUser }, use) => {
    await loginViaStorage(page, newUser.token);
    await use(page);
  },

  // An article owned by newUser, created through the API. It is deleted by newUser's teardown sweep,
  // which also covers the case where the test renamed it (slug changed) or already deleted it.
  article: async ({ apiClient, newUser }, use) => {
    const res = await apiClient.createArticle(newUser.token, buildArticle());
    expect(res.status(), 'create article fixture').toBe(201);
    const { article } = await res.json();
    await use(article);
  },
});

module.exports = { test, expect, loginViaStorage };
