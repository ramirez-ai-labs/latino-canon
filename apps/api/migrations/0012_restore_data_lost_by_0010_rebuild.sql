-- Restores editor-sourced state destroyed by migration 0010's `titles` table
-- rebuild. Found by checking the live collections after a user report: Core Canon
-- showed 0 items, and every title ingested before 0010 ran had lost all credits,
-- tags, and blurbs.
--
-- Root cause: 0010 set `PRAGMA foreign_keys = OFF` before `DROP TABLE titles`,
-- expecting that to prevent the drop from cascading into the six tables that
-- reference titles.id (credits, title_tags, blurbs, collection_items, feedback,
-- title_context_notes) - verified safe locally against Python's sqlite3 (this
-- machine can't run real D1 - macOS 12.6 is below workerd's requirement), but D1
-- did not honor that PRAGMA the same way, and the DROP cascaded for real in
-- production. Every row in those six tables that existed at that moment
-- (~2026-09-14 05:44:06 UTC) was deleted. Title metadata itself survived (it's
-- columns directly on titles, correctly copied during the rebuild) - only the
-- child-table rows were lost.
--
-- Remediation has two parts. Re-ingesting every affected title with force:true
-- (done separately, outside this migration - a batched POST to the deployed
-- ingest worker) restores credits and any seed+model-sourced tags/blurb
-- automatically, since persistTitle/writeTags handle that cleanly against now-
-- empty tables. What re-ingestion can NOT restore is editor-sourced state - tags
-- an editor asserted that the classifier itself never produces, and manually
-- curated collection membership. This migration re-applies exactly that, mirroring
-- 0003/0004/0005/0011's original content. (Two of the fixes those migrations made -
-- 0007's led_by for In the Time of the Butterflies and Tortilla Soup - are now
-- seed-sourced rather than editor-only, since seedInclusionTypes was updated to
-- include them after 0007 shipped; re-ingestion restores those two on its own, so
-- they don't need repeating here.)
--
-- Same FK-safety pattern as every prior data migration: guarded per-row
-- INSERT...SELECT, since this also runs against the test harness's schema-only D1
-- with no ingested title rows.

-- Core Canon (0003): curated "start here" shortlist, chronological.
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'el-norte-1983', 0 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'el-norte-1983');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'stand-and-deliver-1988', 1 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'stand-and-deliver-1988');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'my-family-1995', 2 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'my-family-1995');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'selena-1997', 3 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'selena-1997');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'y-tu-mama-tambien-2001', 4 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'y-tu-mama-tambien-2001');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'real-women-have-curves-2002', 5 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'real-women-have-curves-2002');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'machuca-2004', 6 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'machuca-2004');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'jane-the-virgin-2014', 7 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'jane-the-virgin-2014');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'coco-2017', 8 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'coco-2017');
INSERT OR IGNORE INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'in-the-heights-2021', 9 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'in-the-heights-2021');

-- borderlands theme (0004): the only two titles in the catalog actually about
-- crossing, source='editor' since the classifier has never produced this tag.
INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'el-norte-1983', (SELECT id FROM tags WHERE kind = 'theme' AND slug = 'borderlands'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'el-norte-1983')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'under-the-same-moon-2007', (SELECT id FROM tags WHERE kind = 'theme' AND slug = 'borderlands'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'under-the-same-moon-2007')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

-- queer_latino / led_by gaps (0005).
INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'vida-2018', (SELECT id FROM tags WHERE kind = 'theme' AND slug = 'queer_latino'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'vida-2018')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'one-day-at-a-time-2017', (SELECT id FROM tags WHERE kind = 'theme' AND slug = 'queer_latino'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'one-day-at-a-time-2017')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'one-day-at-a-time-2017', (SELECT id FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'one-day-at-a-time-2017')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'gentefied-2020', (SELECT id FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'gentefied-2020')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

-- Griselda's context note (0009/0011) - representation_handling itself is a column
-- on titles and survived the rebuild; only the child-table note row was lost.
UPDATE titles SET representation_handling = 'contextual' WHERE id = 'griselda-2024';

INSERT INTO title_context_notes (title_id, category, status, summary, sources, display_policy)
SELECT
  'griselda-2024',
  'crime_stereotype_risk',
  'confirmed',
  'Reporting on the series (InSight Crime, Refinery29) documents specific criticism that Griselda reproduces narco/crime-genre stereotypes about Latin Americans, and specifically about women in organized crime, even as it was marketed as a feminist reclamation of Griselda Blanco''s story. The same critique was made of Narcos and Narcos: Mexico, largely the same creative team''s earlier work. This doesn''t change the tags above - the show''s Latino creative leadership is real and independently verified - but the framing is worth surfacing alongside them, not instead of them.',
  '[{"kind":"criticism","ref":"https://insightcrime.org/news/what-netflixs-griselda-gets-wrong-about-women-organized-crime/","quote":null},{"kind":"criticism","ref":"https://www.refinery29.com/en-us/netflix-griselda-sofia-vergara-real-story","quote":null}]',
  'public'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'griselda-2024')
  AND NOT EXISTS (
    SELECT 1 FROM title_context_notes
    WHERE title_id = 'griselda-2024' AND category = 'crime_stereotype_risk'
  );
