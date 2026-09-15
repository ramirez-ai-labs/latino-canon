-- led_by's tag label ("Latino-directed") is being gendered to "Latina-directed" for a
-- confirmed female director - found live: the led_by-filtered "Directors" collection
-- visibly mixed male and female directors under one static label, because nothing in
-- the schema recorded a director's gender at all. TMDB's credits response already
-- includes a per-person gender field (0 = not specified, 1 = female, 2 = male,
-- 3 = non-binary) at zero extra API cost - apps/ingest/src/sources/tmdb.ts now captures
-- it alongside name/id.
--
-- Nullable, no default: existing people rows predate this column and have no gender
-- until re-ingested (persist.ts's people upsert now writes it going forward) or backfilled
-- via the ingest worker's new POST /backfill-gender (TMDB-only, no Workers AI neurons).
ALTER TABLE people ADD COLUMN gender TEXT
  CHECK (gender IS NULL OR gender IN ('female', 'male', 'non_binary'));
