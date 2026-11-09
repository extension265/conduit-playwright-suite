const { test, expect } = require('../../fixtures');
const { AuthPage } = require('../../pages/AuthPage');
const { HomePage } = require('../../pages/HomePage');

test.describe('Sign in', () => {
  // The user is created through the API (fast, no UI dependency); only the sign-in itself goes through the UI.
  test('a user registered via the API can sign in through the UI', async ({ page, newUser }) => {
    const auth = new AuthPage(page);
    const home = new HomePage(page);

    await auth.gotoSignIn();
    await auth.signIn({ email: newUser.email, password: newUser.password });

    await expect(page).toHaveURL('/');
    await expect(home.userLink(newUser.username)).toBeVisible();
    await expect(home.newArticleLink).toBeVisible();
    await expect(home.signInLink).toBeHidden();
    expect(await page.evaluate(() => window.localStorage.getItem('jwtToken'))).toBeTruthy();
  });
});
