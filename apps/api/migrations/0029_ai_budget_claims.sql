-- One row per 70B job kind per UTC day: the ledger the Workers AI budget rule is enforced
-- against (apps/ingest/src/budget.ts). The rule was written down (CLAUDE.md, ROADMAP) but
-- lived only in docs, and broke the day after it was written: on 2026-09-27 a full
-- groundedness run went out on a queue day. The queue and manual ingests record a row
-- when they start work; blurb regeneration and the 70B evals must claim a row first. One
-- such job a day on top of the queue; a full groundedness run also needs a day with no ingest.
-- override = 1 marks a claim made past a refusal; reason says why.
CREATE TABLE IF NOT EXISTS ai_budget_claims (
  day        TEXT NOT NULL,
  kind       TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason     TEXT,
  override   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);
