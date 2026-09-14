-- Corrects Border Stories back to a real `borderlands` signal instead of the
-- `immigration` proxy from 0003. On reflection, `immigration` was too loose - it
-- pulled in In the Heights, which is about an immigrant community already settled
-- in NYC, not border-crossing or migration itself. A second candidate,
-- Y Tu Mamá También, was floated and then dropped: it's a domestic road trip
-- entirely inside Mexico, no border crossing or migration at all.
--
-- El Norte (a Guatemalan brother and sister flee north through Mexico and across
-- the US border) and Under the Same Moon (a boy crosses the US-Mexico border alone
-- to find his undocumented mother) are the only two titles in this catalog that are
-- actually about crossing. Tagged here as source='editor' - the taxonomy's
-- editor > seed > model precedence exists exactly for this: asserting a
-- classification the model itself never produced for any title in the catalog.
--
-- Same FK-safety pattern as 0003: guarded per-row INSERT...SELECT, since this
-- migration also runs against the test harness's schema-only D1 with no ingested
-- title rows.
INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'el-norte-1983', (SELECT id FROM tags WHERE kind = 'theme' AND slug = 'borderlands'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'el-norte-1983')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'under-the-same-moon-2007', (SELECT id FROM tags WHERE kind = 'theme' AND slug = 'borderlands'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'under-the-same-moon-2007')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

UPDATE collections SET smart_query = '{"theme":"borderlands"}' WHERE id = 'border-stories';
