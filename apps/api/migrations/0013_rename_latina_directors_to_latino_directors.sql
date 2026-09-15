-- The 'latina-directors' smart collection (0002) filters on {"inclusionType":"led_by"},
-- and led_by is gender-neutral in the taxonomy - "A Latino director or showrunner held
-- primary creative control" (taxonomy.ts). There's no gender dimension anywhere in the
-- schema. "Latina Directors" promised a filter the query never actually applied, so the
-- shelf visibly mixed male and female directors under a name that said otherwise - found
-- by a live site review. Retitled to match what the query actually selects for, using
-- the same "Latino" wording already used for led_by's own tag label
-- ('Latino-directed', 0002). id/slug are left unchanged - only the display copy was
-- wrong, and changing the slug would break /collections/latina-directors links for no
-- reason connected to this fix.
UPDATE collections
SET title = 'Latino Directors',
    description = 'Feature work directed by Latino filmmakers.'
WHERE id = 'latina-directors';
