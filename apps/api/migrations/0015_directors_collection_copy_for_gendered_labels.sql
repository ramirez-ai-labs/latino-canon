-- Follow-up to 0014: now that led_by's tag label is gendered per-title (Latina-directed
-- vs Latino-directed, driven by the credited director's gender), the collection's own
-- shelf title needs to stop claiming a single gender for the whole list - it's the same
-- {"inclusionType":"led_by"} smart query as before, and that list genuinely contains
-- both. "Directors" makes no gender claim at all; the description says both explicitly.
--
-- Supersedes PR #58's migration 0013, which renamed this same row to the gender-neutral
-- "Latino Directors" on the premise that "Latino" already covers everyone (true
-- elsewhere in this project - Latino Canon, Latino-led cast - but not the direction
-- actually wanted here, which is to keep both terms and let each title's card carry the
-- correct one). If 0013 lands first, this migration's UPDATE still runs and wins by
-- ordering; if 0013 never merges, this is simply the only rename applied. Either way,
-- PR #58 should be closed rather than merged after this - shipping both leaves the
-- collection's title flapping between two different fixes.
UPDATE collections
SET title = 'Directors',
    description = 'Feature work directed by Latino and Latina filmmakers.'
WHERE id = 'latina-directors';
