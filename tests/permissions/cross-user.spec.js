const { test, expect, loginViaStorage } = require('../../fixtures');
const { ArticlePage } = require('../../pages/ArticlePage');
const { EditorPage } = require('../../pages/EditorPage');

// Setup for every test here: user A (newUser) owns `article`; user B (otherUser) is a different, valid user.
//
// The API test is the authoritative proof: the server must reject B's writes.
// The UI test proves B is not offered the controls. The UI redirect is only a client-side
// guard, so on its own it would prove nothing about security.

// Re-reads A's article as A and checks nothing changed.
async function expectArticleUnchanged(apiClient, owner, original) {
  const res = await apiClient.getArticle(original.slug, owner.token);
  expect(res.status(), 'article must still exist').toBe(200);
  const { article } = await res.json();
  expect(article).toMatchObject({
    slug: original.slug,
    title: original.title,
    description: original.description,
    body: original.body,
    updatedAt: original.updatedAt,
    author: { username: owner.username },
  });
  expect([...article.tagList].sort()).toEqual([...original.tagList].sort());
}

test.describe('Cross-user permissions: B cannot change A\'s article', () => {
  test('API: B\'s PUT and DELETE are rejected with 403 and the article is untouched', async ({ apiClient, newUser: userA, otherUser: userB, article }) => {
    const update = await apiClient.updateArticle(userB.token, article.slug, {
      title: 'Hijacked title', body: 'Hijacked body', tagList: [],
    });
    expect(update.status()).toBe(403);
    expect(await update.json()).toEqual({ message: 'You are not authorized to update this article' });

    const del = await apiClient.deleteArticle(userB.token, article.slug);
    expect(del.status()).toBe(403);
    expect(await del.json()).toEqual({ message: 'You are not authorized to delete this article' });

    await expectArticleUnchanged(apiClient, userA, article);
  });

  test('UI: B sees no Edit/Delete controls and is redirected away from the editor', async ({ page, apiClient, newUser: userA, otherUser: userB, article }) => {
    await loginViaStorage(page, userB.token);
    const articlePage = new ArticlePage(page);
    const editor = new EditorPage(page);

    await articlePage.goto(article.slug);
    await expect(articlePage.title).toHaveText(article.title);
    // Wait for B's logged-in view (Follow button) before asserting absence, so the check can't pass on a half-rendered page.
    await expect(page.getByRole('button', { name: `Follow ${userA.username}` }).first()).toBeVisible();
    await expect(articlePage.allEditLinks).toHaveCount(0);
    await expect(articlePage.allDeleteButtons).toHaveCount(0);

    // Going straight to the edit URL: the app's guard sends B home and the form never appears.
    await editor.gotoEdit(article.slug);
    await expect(page).toHaveURL('/');
    await expect(editor.publishButton).toHaveCount(0);

    await expectArticleUnchanged(apiClient, userA, article);
  });
});
