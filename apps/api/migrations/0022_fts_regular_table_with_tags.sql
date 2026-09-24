-- Two titles_fts defects, both fixed by one rebuild:
--
-- 1. It was contentless (content=''), and a contentless FTS5 table can't delete a row
--    without being handed the row's exact previous text. persist.ts never did that - it
--    re-inserted the same rowid, which SQLite accepts while keeping the OLD postings too.
--    Verified: insert rowid 1 'about dogs', re-insert rowid 1 'about cats', and both
--    MATCH 'dogs' and MATCH 'cats' hit. So every force re-ingest (including the nightly
--    retry cron) left the stale synopsis searchable, and writeAliases - which re-inserts
--    the whole document - double-counted every column's terms for aliased titles,
--    quietly inflating their BM25 scores. A regular FTS5 table stores its own copy of the
--    text (trivial at this catalog size) and supports plain DELETE by rowid.
--
-- 2. The `tags` column (bm25 weight 1.5 in lexical.ts) was always written as ''. It now
--    holds confident theme/inclusion labels plus TMDB genres, so "animation" or
--    "documentary" can match by keyword. 0.6 = MODEL_TAG_DISPLAY_THRESHOLD, the same
--    gate as filters.ts's visibilityGateSql; persist.ts's reindexFts builds this row
--    the same way on every later write.
DROP TABLE titles_fts;

CREATE VIRTUAL TABLE titles_fts USING fts5(
  title,
  original_title,
  synopsis,
  people,
  tags,
  aliases,
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
  TRIM(
    COALESCE((
      SELECT GROUP_CONCAT(g.label, ', ')
      FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
      WHERE tt.title_id = t.id AND (tt.source != 'model' OR tt.confidence >= 0.6)
    ), '')
    || ' ' ||
    COALESCE((SELECT GROUP_CONCAT(value, ', ') FROM json_each(t.genres)), '')
  ),
  COALESCE((SELECT GROUP_CONCAT(a.alias, ', ') FROM title_aliases a WHERE a.title_id = t.id), '')
FROM titles t;
