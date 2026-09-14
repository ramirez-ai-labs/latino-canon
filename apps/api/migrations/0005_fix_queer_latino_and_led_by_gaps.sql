-- Fixes two specific representation gaps found by checking every title's tags
-- against what's actually known about each work, not just reading the code:
--
-- - Vida and One Day at a Time both center a queer Latina character's arc as one of
--   their most-cited elements (Vida's reputation in queer Latinx media coverage;
--   One Day at a Time's Elena coming-out storyline) - neither had `queer_latino`
--   tagged at all.
-- - One Day at a Time (Gloria Calderon Kellett) and Gentefied (Marvin Lemus and
--   Linda Yvette Chavez) are both showrunner-led as well as created - the taxonomy's
--   own definition of `led_by` is "director/showrunner held primary creative
--   control," which their creators also hold, but only `created_by` was tagged.
--
-- All source='editor', per the taxonomy's editor > seed > model precedence - human
-- assertions the classifier itself didn't produce. (A Better Life's `indigenous`
-- theme tag was also flagged as questionable in review, but left untouched here:
-- genuine uncertainty about whether it's wrong, not confidence that it is, isn't
-- grounds for an editor override either way.)
--
-- Same FK-safety pattern as 0003/0004: guarded per-row INSERT...SELECT, since this
-- migration also runs against the test harness's schema-only D1 with no ingested
-- title rows.
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
