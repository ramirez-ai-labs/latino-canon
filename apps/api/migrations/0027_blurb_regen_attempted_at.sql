-- POST /regenerate-blurbs (ingest) rewrites old blurbs under the current prompt and
-- replaces one only when the new text passes the ingest gate. When it doesn't, the old
-- blurb stays and this records the attempt, so the daily batch moves on to other titles
-- instead of spending 70B neurons on the same ones again.
ALTER TABLE blurbs ADD COLUMN regen_attempted_at TEXT;
