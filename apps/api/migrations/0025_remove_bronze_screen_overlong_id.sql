-- The Bronze Screen (2002) was persisted as
-- 'the-bronze-screen-100-years-of-the-latino-image-in-american-cinema-2002' (71 bytes).
-- Vectorize caps vector ids at 64 bytes, so its embed step failed (VECTOR_UPSERT_ERROR
-- 40008) and it has no vector and no blurb. slugId now caps ids at 64 bytes at a word
-- boundary, which gives it 'the-bronze-screen-100-years-of-the-latino-image-in-american-2002'.
--
-- Removing the row and its failed job lets the daily ingest queue re-ingest it under the
-- capped id: the seed still pins TMDB 181748, which no live title will have, and no job
-- will have tried it. No vector exists to delete. Same explicit child deletes as 0023.
-- Idempotent: re-running deletes nothing.

CREATE TABLE _bronze (id TEXT PRIMARY KEY);
INSERT INTO _bronze (id) VALUES ('the-bronze-screen-100-years-of-the-latino-image-in-american-cinema-2002');

DELETE FROM titles_fts WHERE rowid IN (SELECT rowid FROM titles WHERE id IN (SELECT id FROM _bronze));

CREATE TABLE _bronze_orphans (id TEXT PRIMARY KEY);
INSERT INTO _bronze_orphans (id)
SELECT DISTINCT person_id FROM credits
WHERE title_id IN (SELECT id FROM _bronze)
  AND person_id NOT IN (SELECT person_id FROM credits WHERE title_id NOT IN (SELECT id FROM _bronze));

DELETE FROM credits WHERE title_id IN (SELECT id FROM _bronze);
DELETE FROM people WHERE id IN (SELECT id FROM _bronze_orphans);
DELETE FROM title_tags WHERE title_id IN (SELECT id FROM _bronze);
DELETE FROM blurbs WHERE title_id IN (SELECT id FROM _bronze);
DELETE FROM collection_items WHERE title_id IN (SELECT id FROM _bronze);
DELETE FROM title_context_notes WHERE title_id IN (SELECT id FROM _bronze);
DELETE FROM title_aliases WHERE title_id IN (SELECT id FROM _bronze);
UPDATE feedback SET title_id = NULL WHERE title_id IN (SELECT id FROM _bronze);
DELETE FROM titles WHERE id IN (SELECT id FROM _bronze);
DELETE FROM ingest_jobs WHERE id = 'job_the_bronze_screen_2002_';

DROP TABLE _bronze_orphans;
DROP TABLE _bronze;
