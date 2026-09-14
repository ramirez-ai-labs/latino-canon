-- Fixes two empty homepage collections, found by testing the live site rather than
-- reading code: `collection_items` had zero rows for any collection at all (so
-- Core Canon, the first card on the homepage, showed nothing), and Border Stories'
-- `{"theme":"borderlands"}` smart-query matched nothing because the classifier has
-- never assigned "borderlands" to any of the 16 ingested titles - it consistently
-- preferred "immigration" for the same border-crossing narratives instead.

-- Core Canon: a curated "start here" shortlist distinct from the other three
-- collections (which are single-criterion smart filters on led_by/breakthrough) -
-- spans every decade in the catalog and both film and series, and deliberately
-- includes titles outside the `led_by` filter (Jane the Virgin, Coco) so it isn't
-- just a re-listing of the Latina Directors collection. Ordered chronologically.
--
-- Each row is its own guarded INSERT...SELECT (not a plain INSERT, and not one
-- combined SELECT with a UNION ALL per title - D1's compound-SELECT term limit
-- rejected that) because this migration also runs against the test harness's
-- schema-only D1, which has no ingested title rows at all. A plain INSERT of a
-- title_id that doesn't exist there would fail collection_items' FOREIGN KEY
-- constraint outright; the WHERE EXISTS guard makes each one a harmless no-op there
-- and the real, intended insert in production, where these titles exist.
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'el-norte-1983', 0 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'el-norte-1983');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'stand-and-deliver-1988', 1 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'stand-and-deliver-1988');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'my-family-1995', 2 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'my-family-1995');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'selena-1997', 3 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'selena-1997');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'y-tu-mama-tambien-2001', 4 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'y-tu-mama-tambien-2001');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'real-women-have-curves-2002', 5 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'real-women-have-curves-2002');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'machuca-2004', 6 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'machuca-2004');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'jane-the-virgin-2014', 7 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'jane-the-virgin-2014');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'coco-2017', 8 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'coco-2017');
INSERT INTO collection_items (collection_id, title_id, ord)
SELECT 'core-canon', 'in-the-heights-2021', 9 WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'in-the-heights-2021');

-- Border Stories: repoint at `immigration`, which is real, model-assigned, and
-- semantically matches this collection's own description ("Migration, the
-- borderlands, and life across two countries") - 5 titles carry it today (El Norte,
-- My Family, Under the Same Moon, A Better Life, In the Heights), all genuine
-- migration/borderlands narratives.
UPDATE collections SET smart_query = '{"theme":"immigration"}' WHERE id = 'border-stories';
