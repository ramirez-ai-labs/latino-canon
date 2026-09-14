-- Extends TitleKind with 'special' (a stand-up comedy special) - found to be a real
-- scope gap while reviewing a Netflix "latino culture" search result set: roughly a
-- third of it was stand-up specials (Gabriel Iglesias, George Lopez, Cristela Alonzo,
-- Felipe Esparza), which had nowhere to go under kind IN ('film', 'series').
--
-- SQLite CHECK constraints can't be altered in place, so this rebuilds titles per
-- SQLite's documented ALTER TABLE procedure (sqlite.org/lang_altertable.html
-- #making_other_kinds_of_table_schema_changes) rather than DROP+CREATE, preserving
-- rowid explicitly - titles_fts is a contentless FTS5 index keyed on titles.rowid
-- (see 0001's `INSERT INTO titles_fts (rowid, ...) SELECT rowid, ... FROM titles`
-- pattern in persist.ts), so a table rebuild that let rowids drift would silently
-- point the lexical index at the wrong rows.
--
-- packages/core/src/types.ts (TitleKind) is the source of truth this CHECK mirrors.
PRAGMA foreign_keys = OFF;

CREATE TABLE titles_new (
  id                      TEXT PRIMARY KEY,
  tmdb_id                 INTEGER UNIQUE,
  imdb_id                 TEXT,
  kind                    TEXT NOT NULL CHECK (kind IN ('film', 'series', 'special')),
  title                   TEXT NOT NULL,
  original_title          TEXT,
  year_start              INTEGER NOT NULL,
  year_end                INTEGER,
  countries               TEXT NOT NULL DEFAULT '[]',
  languages               TEXT NOT NULL DEFAULT '[]',
  synopsis                TEXT,
  poster_key              TEXT,
  popularity              REAL NOT NULL DEFAULT 0,
  runtime                 INTEGER,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  representation_handling TEXT CHECK (representation_handling IS NULL OR representation_handling IN ('contextual', 'critical_archive'))
);

INSERT INTO titles_new (
  rowid, id, tmdb_id, imdb_id, kind, title, original_title, year_start, year_end,
  countries, languages, synopsis, poster_key, popularity, runtime, created_at,
  updated_at, representation_handling
)
SELECT
  rowid, id, tmdb_id, imdb_id, kind, title, original_title, year_start, year_end,
  countries, languages, synopsis, poster_key, popularity, runtime, created_at,
  updated_at, representation_handling
FROM titles;

DROP TABLE titles;
ALTER TABLE titles_new RENAME TO titles;

CREATE INDEX idx_titles_year ON titles (year_start);
CREATE INDEX idx_titles_kind ON titles (kind);
CREATE INDEX idx_titles_popularity ON titles (popularity DESC);

PRAGMA foreign_keys = ON;
