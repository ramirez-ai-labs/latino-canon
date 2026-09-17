-- Migration: Remove misclassified films that don't meet Latino Canon criteria
-- Date: 2026-09-17
-- Reason: Classifier incorrectly tagged non-Latino films as part of canon.
--         These films fail led_by/created_by/about_community criteria.
--
-- Films removed:
-- - Aimée (1981) — French film
-- - Black Swan: Metamorphosis — documentar
-- - Mallepuvvu — non-Latino subject
-- - My Kingdom — non-Latino subject
-- - Kingdom of Saturn: Cassini's Epic Quest — NASA documentary
-- - A Place to Grow — non-Latino subject
-- - Creedance Clearwater Revival: Travelin' Band — music documentary
-- - 1+8 — unclear/non-Latino
-- - Miroslav Vitous: Live in Vienna — music documentary
-- - Bebe Mais: Bichos — non-Latino
-- - Paste Makes Waste — non-Latino
-- - Cinema16: European Short Films (Special US Edition) — European films
-- - The Chase — non-Latino
-- - Devon: Decadence — non-Latino

DELETE FROM titles
WHERE title IN (
  'Aimée',
  'Black Swan: Metamorphosis',
  'Mallepuvvu',
  'My Kingdom',
  'Kingdom of Saturn: Cassini''s Epic Quest',
  'A Place to Grow',
  'Creedance Clearwater Revival: Travelin'' Band',
  '1+8',
  'Miroslav Vitous: Live in Vienna',
  'Bebe Mais: Bichos',
  'Paste Makes Waste',
  'Cinema16: European Short Films (Special US Edition)',
  'The Chase',
  'Devon: Decadence'
);

-- Verify cleanup
SELECT COUNT(*) as remaining_count FROM titles;
