-- Two new orthogonal facets, added as plain nullable columns on titles rather than
-- new tags.kind values - same choice migration 0008 made for representation_handling.
-- tags.kind has a CHECK constraint ('inclusion_type','theme' only); widening it would
-- need the same table-rebuild-and-reinsert procedure migration 0010 used for
-- titles.kind, which cascaded a DROP TABLE into every child row (title_tags included -
-- tags is title_tags' own FK target, so the blast radius here would be worse) and
-- caused real production data loss that 0012 had to hand-restore. A plain ADD COLUMN
-- has no rebuild and no cascade risk.
--
-- genres: JSON array of TMDB genre names (e.g. '["Animation","Family"]'), same shape
-- as the existing countries/languages columns. TMDB's movie/tv detail response already
-- includes a `genres` field on every fetch this project already makes - it was simply
-- never parsed. NULL-safe default '[]' so existing rows read as "no genre data yet"
-- without needing a NULL check everywhere countries/languages don't need one either.
--
-- content_advisory: NULL = not yet classified (same "null = not backfilled" convention
-- as people.gender). Distinct from the CURATION GATE that already rejects hardcore
-- adult/pornographic content outright during classification - this is a softer signal
-- for content that legitimately belongs in the canon but carries mature themes (drug
-- trafficking, explicit sexuality, graphic violence) that shouldn't rank for a
-- family/kids-audience query. No TMDB field maps to this; it's LLM-judged from the
-- synopsis, backfilled separately (see the classify-content-advisory ingest addition).
ALTER TABLE titles ADD COLUMN genres TEXT NOT NULL DEFAULT '[]';
ALTER TABLE titles ADD COLUMN content_advisory TEXT
  CHECK (content_advisory IS NULL OR content_advisory IN ('general', 'mature'));
