-- Backfills what 0009 was supposed to do, which silently no-op'd against production.
--
-- Root cause: deploy-api.yml (runs migrations) and ingest-new-titles.yml (POSTs new
-- titles for async ingestion) both trigger off the same merge push and run in
-- parallel. Ingestion is a multi-step Cloudflare Workflow (resolve -> fetch ->
-- persist -> classify -> embed -> blurb) that takes longer than the migration step,
-- so 0009's guarded `UPDATE ... WHERE id = 'griselda-2024'` and the FK-guarded
-- `INSERT ... WHERE EXISTS` ran before the title row existed - both correctly, safely
-- no-op'd, which is exactly what the WHERE EXISTS/guarded pattern is *for* when a
-- migration might run against a fresh schema-only D1 (the local test harness). It
-- just turns out the same guard also silently swallows this case: a title seeded and
-- given an editor migration in the *same* PR races its own async ingestion.
--
-- Verified against the live API after PR #40 merged: titles/griselda-2024 had the
-- correct seed tags (led_by/created_by/about_community/starring/produced_by, proving
-- ingestion itself succeeded) but representationHandling was null and contextNotes
-- was empty. This migration is a straight repeat of 0009's statements - idempotent
-- via the same UPDATE/ON CONFLICT pattern, safe to run whether or not 0009 already
-- landed.
--
-- General lesson (see also ROADMAP.md): an editor migration that targets a title
-- seeded in the same PR needs to ship as a follow-up migration after ingestion is
-- confirmed complete, not bundled into the title's own introducing PR.
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
