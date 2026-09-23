-- Backfill Animation genre for The Book of Life (2014)
-- This title was not caught by the initial backfill batches due to subrequest limits,
-- and TMDB lists it as Animation. Add it so it appears in animated film searches.
UPDATE titles
SET genres = json('["Animation", "Family"]')
WHERE id = 'the-book-of-life-2014';
