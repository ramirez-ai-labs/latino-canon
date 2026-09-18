-- Phase B: Database cleanup for 13 invalid TMDB entries removed from seed
-- This script deletes orphaned records created by invalid ingestions
--
-- Deletion order respects foreign key constraints:
-- 1. ingest_jobs (no FK dependencies)
-- 2. blurbs (FK: blurbs.title_id → titles.id)
-- 3. title_tags (FK: title_tags.title_id → titles.id)
-- 4. credits (FK: credits.title_id → titles.id)
-- 5. people (cascade: only if no other credits reference them)
-- 6. titles (cleaned last, after all FKs)

-- List of 13 invalid TMDB title slugs to remove
-- Format: title-in-lowercase-year

-- 1. Remove ingest_jobs records
DELETE FROM ingest_jobs
WHERE title_ref IN (
  'The Offended (2016)',
  'Últimos días en La Habana (2016)',
  'El Amparo (2016)',
  'The Movie of My Life (2017)',
  'A Wolf at the Door (2013)',
  'The Thin Yellow Line (2015)',
  'The Boy and the World (2013)',
  'The Golden Dream (2013)',
  'The Liberator (2013)',
  'The Delay (2012)',
  'Tattoo (2013)',
  'Elite Squad 2: The Enemy Within (2010)',
  'Love for Sale (2006)'
);

-- 2. Remove blurbs for orphaned titles
DELETE FROM blurbs
WHERE title_id IN (
  'the-offended-2016',
  'ultimos-dias-en-la-habana-2016',
  'el-amparo-2016',
  'the-movie-of-my-life-2017',
  'a-wolf-at-the-door-2013',
  'the-thin-yellow-line-2015',
  'the-boy-and-the-world-2013',
  'the-golden-dream-2013',
  'the-liberator-2013',
  'the-delay-2012',
  'tattoo-2013',
  'elite-squad-2-the-enemy-within-2010',
  'love-for-sale-2006'
);

-- 3. Remove title_tags for orphaned titles
DELETE FROM title_tags
WHERE title_id IN (
  'the-offended-2016',
  'ultimos-dias-en-la-habana-2016',
  'el-amparo-2016',
  'the-movie-of-my-life-2017',
  'a-wolf-at-the-door-2013',
  'the-thin-yellow-line-2015',
  'the-boy-and-the-world-2013',
  'the-golden-dream-2013',
  'the-liberator-2013',
  'the-delay-2012',
  'tattoo-2013',
  'elite-squad-2-the-enemy-within-2010',
  'love-for-sale-2006'
);

-- 4. Remove credits for orphaned titles
DELETE FROM credits
WHERE title_id IN (
  'the-offended-2016',
  'ultimos-dias-en-la-habana-2016',
  'el-amparo-2016',
  'the-movie-of-my-life-2017',
  'a-wolf-at-the-door-2013',
  'the-thin-yellow-line-2015',
  'the-boy-and-the-world-2013',
  'the-golden-dream-2013',
  'the-liberator-2013',
  'the-delay-2012',
  'tattoo-2013',
  'elite-squad-2-the-enemy-within-2010',
  'love-for-sale-2006'
);

-- 5. Clean up orphaned people (those with no remaining credits)
DELETE FROM people
WHERE id IN (
  SELECT DISTINCT p.id FROM people p
  LEFT JOIN credits c ON p.id = c.person_id
  WHERE c.person_id IS NULL
);

-- 6. Remove orphaned titles (clean last, after all FK constraints satisfied)
DELETE FROM titles
WHERE id IN (
  'the-offended-2016',
  'ultimos-dias-en-la-habana-2016',
  'el-amparo-2016',
  'the-movie-of-my-life-2017',
  'a-wolf-at-the-door-2013',
  'the-thin-yellow-line-2015',
  'the-boy-and-the-world-2013',
  'the-golden-dream-2013',
  'the-liberator-2013',
  'the-delay-2012',
  'tattoo-2013',
  'elite-squad-2-the-enemy-within-2010',
  'love-for-sale-2006'
);

-- Verify cleanup: should all return 0 rows
SELECT COUNT(*) as ingest_jobs_remaining FROM ingest_jobs
WHERE title_ref IN ('The Offended (2016)', 'Últimos días en La Habana (2016)', 'El Amparo (2016)', 'The Movie of My Life (2017)', 'A Wolf at the Door (2013)', 'The Thin Yellow Line (2015)', 'The Boy and the World (2013)', 'The Golden Dream (2013)', 'The Liberator (2013)', 'The Delay (2012)', 'Tattoo (2013)', 'Elite Squad 2: The Enemy Within (2010)', 'Love for Sale (2006)');

SELECT COUNT(*) as titles_remaining FROM titles
WHERE id IN ('the-offended-2016', 'ultimos-dias-en-la-habana-2016', 'el-amparo-2016', 'the-movie-of-my-life-2017', 'a-wolf-at-the-door-2013', 'the-thin-yellow-line-2015', 'the-boy-and-the-world-2013', 'the-golden-dream-2013', 'the-liberator-2013', 'the-delay-2012', 'tattoo-2013', 'elite-squad-2-the-enemy-within-2010', 'love-for-sale-2006');

SELECT COUNT(*) as tags_remaining FROM title_tags
WHERE title_id IN ('the-offended-2016', 'ultimos-dias-en-la-habana-2016', 'el-amparo-2016', 'the-movie-of-my-life-2017', 'a-wolf-at-the-door-2013', 'the-thin-yellow-line-2015', 'the-boy-and-the-world-2013', 'the-golden-dream-2013', 'the-liberator-2013', 'the-delay-2012', 'tattoo-2013', 'elite-squad-2-the-enemy-within-2010', 'love-for-sale-2006');

SELECT COUNT(*) as blurbs_remaining FROM blurbs
WHERE title_id IN ('the-offended-2016', 'ultimos-dias-en-la-habana-2016', 'el-amparo-2016', 'the-movie-of-my-life-2017', 'a-wolf-at-the-door-2013', 'the-thin-yellow-line-2015', 'the-boy-and-the-world-2013', 'the-golden-dream-2013', 'the-liberator-2013', 'the-delay-2012', 'tattoo-2013', 'elite-squad-2-the-enemy-within-2010', 'love-for-sale-2006');

SELECT COUNT(*) as credits_remaining FROM credits
WHERE title_id IN ('the-offended-2016', 'ultimos-dias-en-la-habana-2016', 'el-amparo-2016', 'the-movie-of-my-life-2017', 'a-wolf-at-the-door-2013', 'the-thin-yellow-line-2015', 'the-boy-and-the-world-2013', 'the-golden-dream-2013', 'the-liberator-2013', 'the-delay-2012', 'tattoo-2013', 'elite-squad-2-the-enemy-within-2010', 'love-for-sale-2006');
