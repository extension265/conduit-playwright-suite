const { test, expect } = require('../../fixtures');
const { buildArticle } = require('../../utils/data-factory');

// The server returns tags in no fixed order, so compare them sorted.
const sorted = (tags) => [...tags].sort();

test.describe('Articles API', () => {
  test('article CRUD: create, read, update, delete, then 404', async ({ apiClient, newUser }) => {
    const input = buildArticle();
    let slug;

    await test.step('create returns 201 with every field and the author', async () => {
      const res = await apiClient.createArticle(newUser.token, input);
      expect(res.status()).toBe(201);
      const { article } = await res.json();
      expect(article).toMatchObject({
        title: input.title,
        description: input.description,
        body: input.body,
        author: { username: newUser.username },
      });
      expect(sorted(article.tagList)).toEqual(sorted(input.tagList));
      // Live slug format is "<Title-words>-<authorUserId>", e.g. "Article-mw8t...-90878".
      expect(article.slug).toMatch(new RegExp(`^${input.title.replace(/ /g, '-')}-\\d+$`));
      slug = article.slug;
    });

    await test.step('get returns the same article (anonymous read is allowed)', async () => {
      const res = await apiClient.getArticle(slug);
      expect(res.status()).toBe(200);
      const { article } = await res.json();
      expect(article).toMatchObject({ slug, title: input.title, body: input.body });
      expect(sorted(article.tagList)).toEqual(sorted(input.tagList));
    });

    const changes = {
      title: `${input.title} edited`,
      body: 'Updated body text.',
      // The live API clears the tags if tagList is left out of a PUT (see README), so send it.
      tagList: input.tagList,
    };

    await test.step('update returns 200 and a fresh GET shows the change persisted', async () => {
      const res = await apiClient.updateArticle(newUser.token, slug, changes);
      expect(res.status()).toBe(200);
      const { article: updated } = await res.json();
      expect(updated).toMatchObject({ title: changes.title, body: changes.body, description: input.description });

      // A new title gives a new slug; the old one no longer resolves.
      expect(updated.slug).not.toBe(slug);
      expect((await apiClient.getArticle(slug)).status()).toBe(404);
      slug = updated.slug;

      const fresh = await apiClient.getArticle(slug);
      expect(fresh.status()).toBe(200);
      const { article } = await fresh.json();
      expect(article).toMatchObject({ title: changes.title, body: changes.body, description: input.description });
      expect(sorted(article.tagList)).toEqual(sorted(input.tagList));
    });

    await test.step('delete returns 204 and the article is gone', async () => {
      const res = await apiClient.deleteArticle(newUser.token, slug);
      expect(res.status()).toBe(204);

      const after = await apiClient.getArticle(slug);
      expect(after.status()).toBe(404);
      expect(await after.json()).toEqual({ errors: { article: ['not found'] } });
    });
  });
});
