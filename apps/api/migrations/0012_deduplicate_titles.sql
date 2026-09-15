-- Deduplication: Remove duplicate title entries from page 4+
--
-- Problem: Previous ingest runs added duplicate entries for the same film.
-- Example: "Colada (2026)" appears multiple times with different row IDs.
--
-- Strategy: Keep the entry with most metadata, delete others.
-- For each title+year combination with duplicates:
--   1. Identify which entry has the most complete data (metadata, credits, tags, blurb)
--   2. Merge tags from duplicates into the canonical entry
--   3. Delete duplicate rows
--   4. Cascade deletes handle credits and tags via foreign keys

-- Step 1: Identify duplicates (titles with same title, year, kind)
-- This creates a temp view showing which entries are duplicates
-- and ranks them by completeness (desc = most complete)

CREATE TEMPORARY TABLE duplicate_groups AS
SELECT
  t.id,
  t.title,
  t.year_start,
  t.kind,
  ROW_NUMBER() OVER (
    PARTITION BY t.title, t.year_start, t.kind
    ORDER BY
      (CASE WHEN t.synopsis IS NOT NULL THEN 1 ELSE 0 END) DESC,
      (CASE WHEN t.runtime IS NOT NULL THEN 1 ELSE 0 END) DESC,
      (SELECT COUNT(*) FROM credits WHERE title_id = t.id) DESC,
      (SELECT COUNT(*) FROM title_tags WHERE title_id = t.id) DESC,
      t.updated_at DESC
  ) as dup_rank
FROM titles t
WHERE (t.title, t.year_start, t.kind) IN (
  SELECT title, year_start, kind
  FROM titles
  GROUP BY title, year_start, kind
  HAVING COUNT(*) > 1
);

-- Step 2: Merge tags from duplicate entries into the canonical one
INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT dg.id, tt.tag_id, tt.confidence, tt.source
FROM duplicate_groups dg
JOIN duplicate_groups canonical ON
  canonical.title = dg.title
  AND canonical.year_start = dg.year_start
  AND canonical.kind = dg.kind
  AND canonical.dup_rank = 1
JOIN title_tags tt ON tt.title_id = dg.id
WHERE dg.dup_rank > 1
AND NOT EXISTS (
  SELECT 1 FROM title_tags
  WHERE title_id = canonical.id AND tag_id = tt.tag_id
)
ON CONFLICT (title_id, tag_id) DO NOTHING;

-- Step 3: Copy blurbs from duplicates if canonical has none
INSERT INTO blurbs (title_id, text, sources, model, approved)
SELECT canonical.id, b.text, b.sources, b.model, b.approved
FROM duplicate_groups dg
JOIN duplicate_groups canonical ON
  canonical.title = dg.title
  AND canonical.year_start = dg.year_start
  AND canonical.kind = dg.kind
  AND canonical.dup_rank = 1
JOIN blurbs b ON b.title_id = dg.id
WHERE dg.dup_rank > 1
AND NOT EXISTS (
  SELECT 1 FROM blurbs WHERE title_id = canonical.id
)
ON CONFLICT (title_id) DO UPDATE SET
  text = EXCLUDED.text,
  approved = EXCLUDED.approved
WHERE approved = 1;

-- Step 4: Delete duplicate entries (cascade deletes credits & tags)
DELETE FROM titles
WHERE id IN (
  SELECT id FROM duplicate_groups WHERE dup_rank > 1
);

-- Step 5: Rebuild FTS index for remaining titles
DELETE FROM titles_fts;
INSERT INTO titles_fts (rowid, title, synopsis, original_title)
SELECT id, title, synopsis, original_title FROM titles;

-- Verify: Show before/after count
-- SELECT COUNT(DISTINCT (title, year_start, kind)) as unique_films FROM titles;
