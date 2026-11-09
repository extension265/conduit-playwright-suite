const { test, expect } = require('../../fixtures');
const { EditorPage } = require('../../pages/EditorPage');
const { ArticlePage } = require('../../pages/ArticlePage');
const { ProfilePage } = require('../../pages/ProfilePage');
const { buildArticle } = require('../../utils/data-factory');

test.describe('Article lifecycle (UI)', () => {
  // Logged in by token injection (authedPage), so this test exercises only the article journey.
  test('create, verify, edit, verify, delete an article', async ({ authedPage: page, newUser, apiClient }) => {
    const editor = new EditorPage(page);
    const articlePage = new ArticlePage(page);
    const draft = buildArticle();
    let slug;

    await test.step('create through the editor', async () => {
      await editor.gotoNew();
      await editor.fillForm(draft);
      const { status, article } = await editor.publish();
      expect(status).toBe(201);
      slug = article.slug;
      await expect(page).toHaveURL(`/article/${slug}`);
    });

    await test.step('the article page renders what was typed', async () => {
      await expect(articlePage.title).toHaveText(draft.title);
      await expect(articlePage.body).toHaveText(draft.body);
      await expect(articlePage.tags).toHaveText(draft.tagList); // UI shows tags in the order they were added
      await expect(articlePage.authorLink).toHaveText(newUser.username);
    });

    const edited = { title: `${draft.title} edited`, body: 'Edited body text.' };

    await test.step('edit title and body', async () => {
      await articlePage.editLink.click();
      await editor.waitForPrefill(draft.title);
      await editor.fillForm(edited);
      const { status, article } = await editor.publish();
      expect(status).toBe(200);
      slug = article.slug; // a new title gives a new slug
      await expect(page).toHaveURL(`/article/${slug}`);
    });

    await test.step('the article page and the API both show the edit', async () => {
      await expect(articlePage.title).toHaveText(edited.title);
      await expect(articlePage.body).toHaveText(edited.body);
      await expect(articlePage.tags).toHaveText(draft.tagList); // untouched fields survive the edit

      const res = await apiClient.getArticle(slug);
      expect(res.status()).toBe(200);
      expect((await res.json()).article).toMatchObject({
        title: edited.title, body: edited.body, description: draft.description,
      });
    });

    await test.step('delete it', async () => {
      expect(await articlePage.deleteArticle()).toBe(204);
      await expect(page).toHaveURL('/');
    });

    await test.step('it is gone in the UI and in the API', async () => {
      const profile = new ProfilePage(page);
      await profile.goto(newUser.username);
      await expect(profile.emptyState).toBeVisible();
      await expect(profile.articlePreview(edited.title)).toHaveCount(0);

      // Opening the old URL sends the user back home instead of showing the article.
      await articlePage.goto(slug);
      await expect(page).toHaveURL('/');

      expect((await apiClient.getArticle(slug)).status()).toBe(404);
    });
  });
});
