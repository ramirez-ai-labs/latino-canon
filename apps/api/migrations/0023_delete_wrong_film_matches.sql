-- Delete 14 titles that are the wrong film for their seed entry. None of them belong in
-- the canon; each was ingested from a bad TMDB match:
--
-- * 11 from wrong pinned tmdbIds, found by an audit comparing each pin's TMDB title with
--   the seed title (#243). The seed now pins the right films (#244):
--     Paulina (2015)            -> national-geographic-meister-der-naturfotographie-2009
--     The Club (2015)           -> blue-malone-imaginary-detectives-2013
--     7 Boxes (2012)            -> no-hands-on-the-clock-1941
--     Monarca (2019)            -> swamp-mysteries-with-troy-landry-2018  (monarca-2019 is correct and stays)
--     From Afar (2015)          -> down-dog-2014
--     Casa Grande (2014)        -> walk-the-dark-street-1956
--     The House of Sand (2005)  -> atasco-en-la-nacional-2007
--     Socrates (2018)           -> seguimi-2017
--     The Year My Parents Went on Vacation (2006) -> cirque-du-soleil-la-magie-continue-1987
--     The Line (2019)           -> the-cornstarch-gizmo-2008
--     Bingo: The King of the Mornings (2017) -> ecuador-the-royal-tour-2016
-- * 3 from exact-title TMDB searches that accepted a namesake from another decade (#238):
--     Los olvidados (1950)      -> los-olvidados-2014  (Buñuel's film is live as the-young-and-the-damned-1950)
--     Manuel Rodríguez (1977)   -> manuel-rodriguez-1910  (entry moved to the seed's `removed` ledger, #244)
--     A Queda (1978)            -> a-queda-2025
--
-- Children are deleted explicitly rather than trusting ON DELETE CASCADE, and titles_fts
-- is keyed by titles.rowid, so it goes first. Checked against production before writing
-- (2026-09-25): 14 titles, 100 credits, 52 title_tags, 13 blurbs, 14 titles_fts rows; no
-- collection_items, context notes, aliases or feedback reference them. Their Vectorize
-- vectors are deleted separately (a migration can't reach Vectorize) - see the PR.
-- Idempotent: re-running deletes nothing.

CREATE TABLE _wrong_films (id TEXT PRIMARY KEY);
INSERT INTO _wrong_films (id) VALUES
  ('national-geographic-meister-der-naturfotographie-2009'),
  ('blue-malone-imaginary-detectives-2013'),
  ('no-hands-on-the-clock-1941'),
  ('swamp-mysteries-with-troy-landry-2018'),
  ('down-dog-2014'),
  ('walk-the-dark-street-1956'),
  ('atasco-en-la-nacional-2007'),
  ('seguimi-2017'),
  ('cirque-du-soleil-la-magie-continue-1987'),
  ('the-cornstarch-gizmo-2008'),
  ('ecuador-the-royal-tour-2016'),
  ('los-olvidados-2014'),
  ('manuel-rodriguez-1910'),
  ('a-queda-2025');

DELETE FROM titles_fts WHERE rowid IN (SELECT rowid FROM titles WHERE id IN (SELECT id FROM _wrong_films));

-- People credited only on these titles - recorded before their credits go, deleted after
-- (credits.person_id references people, so people can't go first).
CREATE TABLE _orphan_people (id TEXT PRIMARY KEY);
INSERT INTO _orphan_people (id)
SELECT DISTINCT person_id FROM credits
WHERE title_id IN (SELECT id FROM _wrong_films)
  AND person_id NOT IN (SELECT person_id FROM credits WHERE title_id NOT IN (SELECT id FROM _wrong_films));

DELETE FROM credits WHERE title_id IN (SELECT id FROM _wrong_films);
DELETE FROM people WHERE id IN (SELECT id FROM _orphan_people);
DELETE FROM title_tags WHERE title_id IN (SELECT id FROM _wrong_films);
DELETE FROM blurbs WHERE title_id IN (SELECT id FROM _wrong_films);
DELETE FROM collection_items WHERE title_id IN (SELECT id FROM _wrong_films);
DELETE FROM title_context_notes WHERE title_id IN (SELECT id FROM _wrong_films);
DELETE FROM title_aliases WHERE title_id IN (SELECT id FROM _wrong_films);
UPDATE feedback SET title_id = NULL WHERE title_id IN (SELECT id FROM _wrong_films);
DELETE FROM titles WHERE id IN (SELECT id FROM _wrong_films);

DROP TABLE _orphan_people;
DROP TABLE _wrong_films;
