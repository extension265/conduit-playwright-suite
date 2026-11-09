const { test, expect } = require('../../fixtures');
const { AuthPage } = require('../../pages/AuthPage');
const { HomePage } = require('../../pages/HomePage');
const { buildUser } = require('../../utils/data-factory');
const { API_URL } = require('../../utils/env');

const readStoredToken = (page) => page.evaluate(() => window.localStorage.getItem('jwtToken'));

test.describe('Sign up', () => {
  test('a new user can sign up and is logged in', async ({ page }) => {
    const user = buildUser();
    const auth = new AuthPage(page);
    const home = new HomePage(page);

    await auth.gotoSignUp();
    const registered = page.waitForResponse((res) => res.url() === `${API_URL}/users` && res.request().method() === 'POST');
    await auth.signUp(user);
    const res = await registered;

    expect(res.status()).toBe(201);
    await expect(page).toHaveURL('/');
    await expect(home.userLink(user.username)).toBeVisible();
    await expect(home.signUpLink).toBeHidden();
    // The app must store the token the server issued; that is what keeps the user logged in.
    const { user: created } = await res.json();
    expect(await readStoredToken(page)).toBe(created.token);
  });

  test('signing up with an email that is already taken shows an error and does not log in', async ({ page, newUser }) => {
    const auth = new AuthPage(page);
    const home = new HomePage(page);

    await auth.gotoSignUp();
    await auth.signUp({ ...buildUser(), email: newUser.email });

    await expect(auth.errorMessages).toHaveText(['email has already been taken']);
    await expect(page).toHaveURL('/register');
    await expect(home.signUpLink).toBeVisible();
    expect(await readStoredToken(page)).toBeNull();
  });
});
