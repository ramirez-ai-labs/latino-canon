-- History of eval harness runs (packages/eval), so results are visible somewhere
-- durable instead of only a GitHub Actions run log / artifact that expires.
CREATE TABLE eval_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eval_type TEXT NOT NULL,      -- 'groundedness' | 'retrieval'
  run_at TEXT NOT NULL,         -- ISO 8601, set by the writer at run time
  n INTEGER NOT NULL,           -- items evaluated
  failed INTEGER NOT NULL DEFAULT 0,
  mean_score REAL,              -- primary headline metric for the type
  metrics TEXT,                 -- JSON: full metric set (e.g. {"mean":0.512} or {"recall@5":..,"mrr":..})
  details TEXT                  -- JSON: per-item results / worst offenders, for drill-down
);

CREATE INDEX idx_eval_runs_type_time ON eval_runs (eval_type, run_at DESC);
