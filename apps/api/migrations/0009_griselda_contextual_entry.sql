-- Proof-of-concept title for the representation_handling schema (0008). Verified
-- full credits, not name-recognition or surname inference (per CRITERIA.md #1-2):
--
-- - Andres Baiz (b. Cali, Colombia) directed all 6 episodes -> led_by
-- - Ingrid Escajeda (Hispanic on her father's side, confirmed via her own bio, not a
--   surname guess) co-created, co-wrote, and co-executive-produced as co-showrunner
--   -> created_by, produced_by, and a second led_by basis (showrunner)
-- - Sofia Vergara (Colombian) stars and executive produces -> starring, produced_by
-- - The story centers a Colombian immigrant's rise in the drug trade - her heritage
--   and the Colombian-Miami community context aren't backdrop, they're the plot
--   -> about_community
--
-- All of that is genuinely earned - this is NOT a "no real Latino creative
-- leadership, so fall back to a caveat" case. It's the more useful proof case: a
-- title can carry full standard tags AND a sourced representation caveat at the same
-- time, because representation_handling is an orthogonal axis, not a consolation
-- category. The caveat itself: reporting (InSight Crime, Refinery29) documents
-- specific criticism that the series reproduces narco/crime-genre stereotypes about
-- Latin Americans and about women in organized crime, even while marketed as a
-- feminist reclamation of Griselda Blanco's story - the same critique previously
-- made of Narcos/Narcos: Mexico, largely the same creative team's earlier work.
--
-- UPDATE is a natural no-op if the title isn't ingested yet (unlike the child-table
-- INSERT below, it has no FK to violate) - correct for both the test harness's
-- schema-only D1 and for running before ingest-new-titles.yml has processed this
-- title post-merge.
UPDATE titles SET representation_handling = 'contextual' WHERE id = 'griselda-2024';

INSERT INTO title_context_notes (title_id, category, status, summary, sources, display_policy)
SELECT
  'griselda-2024',
  'crime_stereotype_risk',
  'confirmed',
  'Reporting on the series (InSight Crime, Refinery29) documents specific criticism that Griselda reproduces narco/crime-genre stereotypes about Latin Americans, and specifically about women in organized crime, even as it was marketed as a feminist reclamation of Griselda Blanco''s story. The same critique was made of Narcos and Narcos: Mexico, largely the same creative team''s earlier work. This doesn''t change the tags above - the show''s Latino creative leadership is real and independently verified - but the framing is worth surfacing alongside them, not instead of them.',
  '[{"kind":"criticism","ref":"https://insightcrime.org/news/what-netflixs-griselda-gets-wrong-about-women-organized-crime/","quote":null},{"kind":"criticism","ref":"https://www.refinery29.com/en-us/netflix-griselda-sofia-vergara-real-story","quote":null}]',
  'public'
WHERE EXISTS (SELECT 1 FROM titles WHERE id = 'griselda-2024');
