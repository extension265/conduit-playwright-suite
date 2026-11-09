// Builds unique test data. Every call returns values that no other test, worker or CI run will use,
// so tests never collide on the shared public instance (username, email and title must all be unique).

// e.g. "mw8t2dgp4g0e": base-36 timestamp + random suffix. Lowercase letters and digits only,
// because the server lowercases tags and builds slugs from titles.
function uniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function buildUser() {
  const id = uniqueId();
  return {
    username: `qa${id}`,
    email: `qa${id}@example.com`,
    password: `Pw-${id}`, // throwaway password for a throwaway account; nothing secret is stored in the repo
  };
}

function buildArticle(overrides = {}) {
  const id = uniqueId();
  return {
    title: `Article ${id}`,
    description: `Description ${id}`,
    body: `Body for article ${id}.`,
    // Unique lowercase tags: the server merges tags case-insensitively with existing global tags
    // (e.g. "qa" comes back as "QA"), so generic words would not round-trip unchanged.
    tagList: [`tag${id}`, `qa${id}`],
    ...overrides,
  };
}

module.exports = { uniqueId, buildUser, buildArticle };
