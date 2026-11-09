const { expect } = require('@playwright/test');
const { API_URL } = require('../utils/env');

// The article editor: /editor (new article) and /editor/:slug (edit an existing one).
class EditorPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.titleInput = page.getByPlaceholder('Article Title');
    this.descriptionInput = page.getByPlaceholder("What's this article about?");
    this.bodyInput = page.getByPlaceholder('Write your article (in markdown)');
    this.tagInput = page.getByPlaceholder('Enter tags');
    this.publishButton = page.getByRole('button', { name: 'Publish Article' });
  }

  async gotoNew() {
    await this.page.goto('/editor');
  }

  async gotoEdit(slug) {
    await this.page.goto(`/editor/${slug}`);
  }

  // On /editor/:slug the inputs start empty and are filled once GET /articles/:slug returns.
  // Typing before that races the prefill, so wait until the form shows the current title.
  // This is a synchronisation wait, not a test assertion.
  async waitForPrefill(currentTitle) {
    await expect(this.titleInput).toHaveValue(currentTitle);
  }

  async fillForm({ title, description, body, tagList = [] }) {
    if (title !== undefined) await this.titleInput.fill(title);
    if (description !== undefined) await this.descriptionInput.fill(description);
    if (body !== undefined) await this.bodyInput.fill(body);
    for (const tag of tagList) {
      await this.tagInput.fill(tag);
      await this.tagInput.press('Enter'); // each Enter adds one tag pill
    }
  }

  // Clicks Publish and waits for the save request (POST for new, PUT for edit).
  // Returns the saved article from the API response so the test knows the (possibly new) slug.
  async publish() {
    const saved = this.page.waitForResponse(
      (res) => res.url().startsWith(`${API_URL}/articles`) && ['POST', 'PUT'].includes(res.request().method()),
    );
    await this.publishButton.click();
    const res = await saved;
    return { status: res.status(), article: (await res.json()).article };
  }
}

module.exports = { EditorPage };
