const { test, expect } = require('../../fixtures');
const { buildUser } = require('../../utils/data-factory');

// A JWT is three base64url segments separated by dots.
const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

test.describe('Auth API', () => {
  test('register returns 201 with the new user and a token', async ({ apiClient }) => {
    const user = buildUser();

    const res = await apiClient.register(user);

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user).toMatchObject({ username: user.username, email: user.email });
    expect(body.user.token).toMatch(JWT_PATTERN);
    expect(body.user).not.toHaveProperty('password');
  });

  test('login with the registered credentials returns 200 and a working token', async ({ apiClient, newUser }) => {
    const res = await apiClient.login({ email: newUser.email, password: newUser.password });

    expect(res.status()).toBe(200);
    const { user } = await res.json();
    expect(user).toMatchObject({ username: newUser.username, email: newUser.email });
    expect(user.token).toMatch(JWT_PATTERN);

    // Prove the token actually authenticates: creating an article needs a valid one (401 without).
    const created = await apiClient.createArticle(user.token, {
      title: `Login check ${newUser.username}`, description: 'd', body: 'b', tagList: [],
    });
    expect(created.status()).toBe(201);
    expect((await created.json()).article.author.username).toBe(newUser.username);
  });

  test('registering a taken email or username returns 422 with a field error', async ({ apiClient, newUser }) => {
    const fresh = buildUser();

    const dupEmail = await apiClient.register({ ...fresh, email: newUser.email });
    expect(dupEmail.status()).toBe(422);
    expect(await dupEmail.json()).toEqual({ errors: { email: ['has already been taken'] } });

    const dupUsername = await apiClient.register({ ...fresh, username: newUser.username });
    expect(dupUsername.status()).toBe(422);
    expect(await dupUsername.json()).toEqual({ errors: { username: ['has already been taken'] } });
  });
});
