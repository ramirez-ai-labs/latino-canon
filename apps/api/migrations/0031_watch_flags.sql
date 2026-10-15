-- Where to watch (docs/design/WHERE_TO_WATCH.md): the title page links to TMDB's watch page,
-- which always exists - for a title with no offers it says "There are no offers" - so the
-- site decides from these flags, set from TMDB's watch/providers data on the detail call
-- ingest and the popularity refresh already make. No extra request, no neurons.
-- watch_us is 1 when TMDB lists at least one US offer (stream, free, ads, rent or buy).
-- watch_anywhere is 1 when TMDB lists offers in any country.
-- All three stay NULL until a title is first checked - unknown, not "nowhere".
ALTER TABLE titles ADD COLUMN watch_us INTEGER;
ALTER TABLE titles ADD COLUMN watch_anywhere INTEGER;
ALTER TABLE titles ADD COLUMN watch_checked_at TEXT;
