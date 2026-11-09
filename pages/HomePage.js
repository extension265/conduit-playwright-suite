// Home page and the top navigation bar, which is the same on every page.
class HomePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.nav = page.getByRole('navigation').first();
    this.signInLink = this.nav.getByRole('link', { name: 'Sign in' });
    this.signUpLink = this.nav.getByRole('link', { name: 'Sign up' });
    this.newArticleLink = this.nav.getByRole('link', { name: 'New Article' });
  }

  async goto() {
    await this.page.goto('/');
  }

  // The logged-in nav shows a link to the user's profile, named after the user.
  userLink(username) {
    return this.nav.getByRole('link', { name: username });
  }
}

module.exports = { HomePage };
