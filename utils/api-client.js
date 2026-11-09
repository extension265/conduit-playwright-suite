const { API_URL } = require('./env');

// Thin wrapper over Playwright's APIRequestContext.
// Every method returns the raw APIResponse so the caller decides what to assert (status, body).
// The token is passed per call, which makes "same request, different user" tests easy to read.
class ApiClient {
  /** @param {import('@playwright/test').APIRequestContext} request */
  constructor(request) {
    this.request = request;
  }

  headers(token) {
    // Conduit uses "Token <jwt>", not "Bearer <jwt>" (verified in recon).
    return token ? { Authorization: `Token ${token}` } : {};
  }

  register({ username, email, password }) {
    return this.request.post(`${API_URL}/users`, { data: { user: { username, email, password } } });
  }

  login({ email, password }) {
    return this.request.post(`${API_URL}/users/login`, { data: { user: { email, password } } });
  }

  createArticle(token, article) {
    return this.request.post(`${API_URL}/articles`, { headers: this.headers(token), data: { article } });
  }

  getArticle(slug, token) {
    return this.request.get(`${API_URL}/articles/${slug}`, { headers: this.headers(token) });
  }

  // The live API returns an empty list for ?author= unless the request is authenticated.
  listArticlesByAuthor(token, username) {
    return this.request.get(`${API_URL}/articles`, {
      headers: this.headers(token),
      params: { author: username, limit: 100 },
    });
  }

  // Note: the live API clears tagList if it is left out of a PUT, so callers should send it.
  updateArticle(token, slug, changes) {
    return this.request.put(`${API_URL}/articles/${slug}`, { headers: this.headers(token), data: { article: changes } });
  }

  deleteArticle(token, slug) {
    return this.request.delete(`${API_URL}/articles/${slug}`, { headers: this.headers(token) });
  }
}

module.exports = { ApiClient };
