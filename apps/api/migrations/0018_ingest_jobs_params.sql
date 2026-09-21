-- Stores the exact IngestParams JSON used to create a job, so retryErroredJobs can
-- replay the identical params instead of reconstructing them from title_ref alone.
-- title_ref is lossy (just "Title (Year)") - it has no kind/tmdbId/seedInclusionTypes,
-- and guessing those from scratch is exactly what corrupted an unrelated title
-- (Firefly) this project has already hit once. NULL for jobs created before this
-- column existed; retryErroredJobs treats those as unsafe to auto-replay.
ALTER TABLE ingest_jobs ADD COLUMN params TEXT;
