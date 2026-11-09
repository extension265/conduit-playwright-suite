const { API_URL } = require('../utils/env');

// Single article view: /article/:slug
class ArticlePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1 });
    // The body is rendered markdown with no landmark or role, so these are CSS fallbacks.
    this.body = page.locator('.article-content p').first();
    this.tags = page.locator('.article-content .tag-list li');
    // The author controls are shown twice (banner and below the body), so .first() picks the banner copy.
    this.editLink = page.getByRole('link', { name: 'Edit Article' }).first();
    this.deleteButton = page.getByRole('button', { name: 'Delete Article' }).first();
    // Every Edit/Delete control on the page, used to assert they are absent for non-authors.
    this.allEditLinks = page.getByRole('link', { name: 'Edit Article' });
    this.allDeleteButtons = page.getByRole('button', { name: 'Delete Article' });
    this.authorLink = page.locator('.banner .author');
  }

  async goto(slug) {
    await this.page.goto(`/article/${slug}`);
  }

  // Clicks Delete and waits for the DELETE call, so the test continues only after the server answered.
  async deleteArticle() {
    const deleted = this.page.waitForResponse(
      (res) => res.url().startsWith(`${API_URL}/articles/`) && res.request().method() === 'DELETE',
    );
    await this.deleteButton.click();
    return (await deleted).status();
  }
}

module.exports = { ArticlePage };
