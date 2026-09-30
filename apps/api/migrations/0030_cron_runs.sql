-- One row per run of the ingest worker's daily cron (apps/ingest/src/cron.ts): the ingest
-- queue, errored-job retries and the popularity refresh. Before this, a day with nothing to
-- do left no trace in D1, so a quiet day looked the same as a cron that never fired, and a
-- task that threw inside waitUntil was recorded nowhere (ROADMAP #17, 2026-09-29).
-- A count is NULL when its task failed, and that task's error says why.
CREATE TABLE IF NOT EXISTS cron_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at       TEXT NOT NULL,
  duration_ms      INTEGER NOT NULL,
  queue_started    INTEGER,
  jobs_retried     INTEGER,
  titles_refreshed INTEGER,
  queue_error      TEXT,
  retry_error      TEXT,
  refresh_error    TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at ON cron_runs (started_at);
