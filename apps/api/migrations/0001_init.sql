-- Latino Canon — D1 schema
-- Relational metadata + FTS5 lexical index. Semantic vectors live in Vectorize,
-- keyed by title id.

PRAGMA foreign_keys = ON;

CREATE TABLE titles (
  id             TEXT PRIMARY KEY,               -- slug, e.g. "real-women-have-curves-2002"
  tmdb_id        INTEGER UNIQUE,
  imdb_id        TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('film','series')),
  title          TEXT NOT NULL,
  original_title TEXT,
  year_start     INTEGER NOT NULL,
  year_end       INTEGER,
  countries      TEXT NOT NULL DEFAULT '[]',     -- JSON array of ISO 3166-1 alpha-2
  languages      TEXT NOT NULL DEFAULT '[]',     -- JSON array of ISO 639-1
  synopsis       TEXT,
  poster_key     TEXT,                           -- R2 object key
  popularity     REAL NOT NULL DEFAULT 0,
  runtime        INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_titles_year ON titles (year_start);
CREATE INDEX idx_titles_kind ON titles (kind);
CREATE INDEX idx_titles_popularity ON titles (popularity DESC);

CREATE TABLE people (
  id                   TEXT PRIMARY KEY,
  tmdb_id              INTEGER UNIQUE,
  name                 TEXT NOT NULL,
  known_for_department TEXT
);

CREATE TABLE credits (
  title_id  TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('director','writer','creator','cast')),
  character TEXT,
  ord       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, person_id, role)
);
CREATE INDEX idx_credits_title ON credits (title_id);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  kind  TEXT NOT NULL CHECK (kind IN ('inclusion_type','theme')),
  slug  TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE (kind, slug)
);

CREATE TABLE title_tags (
  title_id   TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1.0,
  source     TEXT NOT NULL CHECK (source IN ('seed','model','editor')),
  PRIMARY KEY (title_id, tag_id)
);
CREATE INDEX idx_title_tags_tag ON title_tags (tag_id);

CREATE TABLE blurbs (
  title_id   TEXT PRIMARY KEY REFERENCES titles(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  sources    TEXT NOT NULL DEFAULT '[]',   -- JSON array of BlurbSource
  model      TEXT NOT NULL,
  approved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE collections (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL CHECK (kind IN ('curated','smart')),
  smart_query TEXT                          -- JSON SearchFilters for kind='smart'
);

CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  title_id      TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  ord           INTEGER NOT NULL DEFAULT 0,
  note          TEXT,
  PRIMARY KEY (collection_id, title_id)
);

CREATE TABLE feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id   TEXT REFERENCES titles(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ingestion / human-review queue (Workflow writes here; editor UI reads it).
CREATE TABLE ingest_jobs (
  id         TEXT PRIMARY KEY,
  title_ref  TEXT NOT NULL,                 -- "title (year)" before resolution
  stage      TEXT NOT NULL,                 -- resolve|fetch|persist|embed|classify|blurb|review
  status     TEXT NOT NULL CHECK (status IN ('pending','running','needs_review','done','error')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ingest_jobs_status ON ingest_jobs (status);

-- FTS5 lexical index. Content table = titles; external-content pattern keeps it in sync.
CREATE VIRTUAL TABLE titles_fts USING fts5(
  title,
  original_title,
  synopsis,
  people,          -- denormalized "Director Name, Cast A, Cast B"
  tags,            -- denormalized theme + inclusion labels
  content='',      -- contentless: we populate explicitly from the ingest pipeline
  tokenize = "unicode61 remove_diacritics 2"
);
