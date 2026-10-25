-- Remove two Sundance 2026 titles added in #348 that don't belong in the canon. Editor
-- decision (2026-10-25): neither is Latino-directed, Latino-created or Latino-produced,
-- nor about the community, so they meet no inclusion type in CRITERIA.md:
--     The Musical (2026)                 -> the-musical-2026
--     If I Go Will They Miss Me (2026)   -> if-i-go-will-they-miss-me-2026
-- Both seed entries moved to the `removed` ledger in the same PR, so the daily queue
-- won't re-ingest them.
--
-- Same explicit child deletes as 0023: titles_fts is keyed by titles.rowid, so it goes
-- first, and people credited only on these titles are recorded before their credits go.
-- Their Vectorize vectors are deleted separately (a migration can't reach Vectorize) -
-- see the PR. Idempotent: re-running deletes nothing.

CREATE TABLE _not_canon (id TEXT PRIMARY KEY);
INSERT INTO _not_canon (id) VALUES
  ('the-musical-2026'),
  ('if-i-go-will-they-miss-me-2026');

DELETE FROM titles_fts WHERE rowid IN (SELECT rowid FROM titles WHERE id IN (SELECT id FROM _not_canon));

CREATE TABLE _not_canon_orphans (id TEXT PRIMARY KEY);
INSERT INTO _not_canon_orphans (id)
SELECT DISTINCT person_id FROM credits
WHERE title_id IN (SELECT id FROM _not_canon)
  AND person_id NOT IN (SELECT person_id FROM credits WHERE title_id NOT IN (SELECT id FROM _not_canon));

DELETE FROM credits WHERE title_id IN (SELECT id FROM _not_canon);
DELETE FROM people WHERE id IN (SELECT id FROM _not_canon_orphans);
DELETE FROM title_tags WHERE title_id IN (SELECT id FROM _not_canon);
DELETE FROM blurbs WHERE title_id IN (SELECT id FROM _not_canon);
DELETE FROM collection_items WHERE title_id IN (SELECT id FROM _not_canon);
DELETE FROM title_context_notes WHERE title_id IN (SELECT id FROM _not_canon);
DELETE FROM title_aliases WHERE title_id IN (SELECT id FROM _not_canon);
UPDATE feedback SET title_id = NULL WHERE title_id IN (SELECT id FROM _not_canon);
DELETE FROM titles WHERE id IN (SELECT id FROM _not_canon);
DELETE FROM ingest_jobs WHERE id IN ('job_the_musical_2026_', 'job_if_i_go_will_they_miss_me_2026_');

DROP TABLE _not_canon_orphans;
DROP TABLE _not_canon;
