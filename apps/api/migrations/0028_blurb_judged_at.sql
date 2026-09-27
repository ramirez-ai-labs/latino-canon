-- When the groundedness gate last judged a blurb. The Eval page charts the gate by day,
-- and created_at can't serve: /regenerate-blurbs replaces a blurb's text in place, so a
-- rewrite judged today would count on the day the original was written.
-- Set by recordBlurbVerdict (ingest persist.ts), cleared with the other verdict columns
-- when a re-ingest changes the text.
ALTER TABLE blurbs ADD COLUMN judged_at TEXT;
-- Blurbs judged before this column existed were judged at ingest, so created_at is right.
UPDATE blurbs SET judged_at = created_at WHERE judge_version IS NOT NULL AND judged_at IS NULL;
