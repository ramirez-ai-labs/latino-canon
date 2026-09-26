-- The ingest Workflow now runs the v3 groundedness judge on every new blurb and
-- approves it when the judge finds every claim supported (apps/ingest workflow.ts).
-- These columns record that verdict, so an auto-approval can be told apart from an
-- editor's and audited later.
-- groundedness and judge_version are the judge's score and GROUNDEDNESS_JUDGE_VERSION.
-- approved_by is 'judge' for an ingest auto-approval. It stays NULL for approvals made
-- before this migration and for editors approving by hand.
-- All three reset when a re-ingest changes the blurb text (persist.ts writeBlurb).
ALTER TABLE blurbs ADD COLUMN groundedness REAL;
ALTER TABLE blurbs ADD COLUMN judge_version INTEGER;
ALTER TABLE blurbs ADD COLUMN approved_by TEXT;
