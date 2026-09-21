-- Alternate titles that should surface the same title in lexical search - translated
-- titles (a US theatrical release title distinct from both `title` and TMDB's own
-- `original_title`), common misspellings, and well-known nicknames. Directly closes
-- ROADMAP.md #3, the "obscure/half-remembered search" gap: verified live before this
-- migration that "and your mother too" finds nothing today, even though `title` and
-- `original_title` already cover most language-swap cases on their own (TMDB's own
-- original_title is already indexed - e.g. "como agua para chocolate" already finds
-- Like Water for Chocolate). This table is for the real remainder: a name TMDB's own
-- title/original_title fields never captured at all.
CREATE TABLE title_aliases (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  alias    TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('translation', 'alt_title', 'misspelling', 'nickname')),
  UNIQUE(title_id, alias)
);
CREATE INDEX idx_title_aliases_title_id ON title_aliases (title_id);

-- FTS5 doesn't support ALTER TABLE ADD COLUMN, so this rebuilds titles_fts the same
-- way migration 0010 rebuilt `titles` itself - drop, recreate with the new column,
-- repopulate from the tables that are the actual source of truth (titles/credits/
-- people), not a rowid-preserving copy. `aliases` comes back empty for every title
-- until seeded/backfilled via persist.ts's writeAliases - expected here, not a bug.
DROP TABLE titles_fts;

CREATE VIRTUAL TABLE titles_fts USING fts5(
  title,
  original_title,
  synopsis,
  people,
  tags,
  aliases,
  content='',
  tokenize = "unicode61 remove_diacritics 2"
);

INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags, aliases)
SELECT
  t.rowid,
  t.title,
  COALESCE(t.original_title, ''),
  COALESCE(t.synopsis, ''),
  COALESCE((
    SELECT GROUP_CONCAT(p.name, ', ')
    FROM credits c JOIN people p ON p.id = c.person_id
    WHERE c.title_id = t.id
  ), ''),
  '',
  ''
FROM titles t;
