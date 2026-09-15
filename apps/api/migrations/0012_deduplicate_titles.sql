-- Deduplication: Remove duplicate title entries from page 4+
--
-- Problem: Previous ingest runs added duplicate entries for the same film.
-- Example: "Colada (2026)" appears multiple times with different row IDs.
--
-- Strategy: For each (title, year_start, kind) group with duplicates,
-- keep the most complete entry (most metadata/credits/tags), delete others.

-- Step 1: Identify the canonical (best) entry for each duplicate group
-- Keep: entry with non-null synopsis, non-null runtime, most credits/tags, most recent
WITH duplicate_groups AS (
  SELECT
    t.id,
    t.title,
    t.year_start,
    t.kind,
    ROW_NUMBER() OVER (
      PARTITION BY t.title, t.year_start, t.kind
      ORDER BY
        CASE WHEN t.synopsis IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN t.runtime IS NOT NULL THEN 0 ELSE 1 END,
        (SELECT COUNT(*) FROM credits WHERE title_id = t.id) DESC,
        (SELECT COUNT(*) FROM title_tags WHERE title_id = t.id) DESC,
        t.updated_at DESC
    ) as dup_rank
  FROM titles t
)
-- Step 2: Delete all duplicates except rank 1 (the canonical entry)
DELETE FROM titles
WHERE id IN (
  SELECT id FROM duplicate_groups WHERE dup_rank > 1
);

-- Step 3: Rebuild FTS index
DELETE FROM titles_fts;
INSERT INTO titles_fts (rowid, title, synopsis, original_title)
SELECT id, title, synopsis, original_title FROM titles;
