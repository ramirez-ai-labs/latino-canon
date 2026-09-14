-- Extends the inclusion_type vocabulary with two dimensions the original four
-- couldn't express, found by a real ambiguity while reviewing candidate titles: a
-- Latino actor can hold the lead role in a story whose director, writer, and content
-- aren't otherwise Latino-focused (e.g. Pedro Pascal in The Last of Us, Jenna Ortega
-- in Wednesday) - that's neither about_community (about what the story centers, not
-- who's cast) nor led_by/created_by (about who directed or wrote it). starring and
-- produced_by fill that gap, matching a distinction the taxonomy was missing rather
-- than an actor being Latino somewhere in an ensemble.
--
-- packages/core/src/taxonomy.ts is the source of truth for the full vocabulary
-- (INCLUSION_TYPES); this just keeps the `tags` table in sync with it, same as
-- 0002 did for the original four.
INSERT INTO tags (kind, slug, label) VALUES
  ('inclusion_type', 'starring', 'Latino-led cast'),
  ('inclusion_type', 'produced_by', 'Latino-produced');
