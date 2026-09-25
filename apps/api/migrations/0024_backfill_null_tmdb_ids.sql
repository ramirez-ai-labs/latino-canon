-- Three live titles have tmdb_id NULL - loaded through /seed-load, which inserts seed
-- rows without resolving TMDB. The daily ingest queue (apps/ingest/src/ingest-queue.ts)
-- decides what's live by tmdb_id, so without this it would spend three days' slots
-- re-sending titles that are already correct and then hold them as anomalies.
--
-- Each id is the seed entry's pin, checked against TMDB (2026-09-25): title, year and
-- director match the live row. Guarded on tmdb_id IS NULL, so it can never overwrite a
-- real value, and re-running changes nothing.
-- É Proibido Fumar (Anna Muylaert), Wiñaypacha (Óscar Catacora), Retablo (Álvaro Delgado-Aparicio).
-- Comments stay on their own lines, without semicolons: the migration runner splits on
-- semicolons, and a trailing comment becomes an empty statement D1 rejects.
UPDATE titles SET tmdb_id = 81055 WHERE id = 'smoke-gets-in-your-eyes-2009' AND tmdb_id IS NULL;
UPDATE titles SET tmdb_id = 511425 WHERE id = 'eternity-2018' AND tmdb_id IS NULL;
UPDATE titles SET tmdb_id = 499394 WHERE id = 'retablo-2018' AND tmdb_id IS NULL;
