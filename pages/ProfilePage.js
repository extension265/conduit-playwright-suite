// User profile: /profile/:username, with the "My Posts" list of that user's articles.
class ProfilePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.emptyState = page.getByText('No articles are here... yet.');
  }

  async goto(username) {
    await this.page.goto(`/profile/${username}`);
  }

  articlePreview(title) {
    return this.page.getByRole('heading', { name: title });
  }
}

module.exports = { ProfilePage };
