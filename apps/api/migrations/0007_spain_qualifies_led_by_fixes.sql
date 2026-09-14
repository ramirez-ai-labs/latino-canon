-- Reverses a scope default applied earlier this project: Spain/Spanish (Iberian)
-- heritage was being treated as not qualifying for this taxonomy's "Latino" (a
-- Latin-America-only reading applied by default, never an explicit call). That
-- default excluded two directors from led_by even though they held primary
-- creative control:
--
-- - In the Time of the Butterflies (2001), directed by Mariano Barroso (Spanish)
-- - Tortilla Soup (2001), directed by Maria Ripoll (Spanish)
--
-- CRITERIA.md now states Spain/Spanish heritage qualifies (see "Scope of
-- 'Latino'"). This backfills led_by for both titles in already-ingested D1 data;
-- canon.seed.json's seedInclusionTypes was also updated so future re-ingests
-- produce the same result, but editing the seed alone doesn't touch rows already
-- persisted from a prior ingest.
--
-- source='editor', per the taxonomy's editor > seed > model precedence.
-- Same FK-safety pattern as 0003/0004/0005: guarded per-row INSERT...SELECT,
-- since this migration also runs against the test harness's schema-only D1 with
-- no ingested title rows.
INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'in-the-time-of-the-butterflies-2001', (SELECT id FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'in-the-time-of-the-butterflies-2001')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;

INSERT INTO title_tags (title_id, tag_id, confidence, source)
SELECT 'tortilla-soup-2001', (SELECT id FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'), 1.0, 'editor'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'tortilla-soup-2001')
ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source;
