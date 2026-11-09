// Sign-up (/register) and sign-in (/login) share the same layout, so one page object covers both.
class AuthPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.usernameInput = page.getByPlaceholder('Username');
    this.emailInput = page.getByPlaceholder('Email');
    this.passwordInput = page.getByPlaceholder('Password');
    this.signUpButton = page.getByRole('button', { name: 'Sign up' });
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
    // The error list has no accessible name, so this is a CSS fallback.
    this.errorMessages = page.locator('.error-messages li');
  }

  async gotoSignUp() {
    await this.page.goto('/register');
  }

  async gotoSignIn() {
    await this.page.goto('/login');
  }

  async signUp({ username, email, password }) {
    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signUpButton.click();
  }

  async signIn({ email, password }) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }
}

module.exports = { AuthPage };
