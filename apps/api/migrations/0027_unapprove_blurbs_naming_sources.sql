-- The first judge-gated ingest batch (2026-09-26) auto-approved 7 blurbs that name their
-- sources in the prose ("according to s1", "says a1", "according to OMDb"). Every claim
-- was sourced, so the judge passed them; readers saw raw ids, and card teasers read
-- "according to ." Ingest now holds such blurbs (blurbTextProblems in packages/core).
-- This un-approves the 7 already live, found by scanning all 213 approved blurbs with the
-- same check. Only judge approvals are touched: an editor's approval stands. The text is
-- kept for an editor to fix or a re-ingest to replace.
UPDATE blurbs
SET approved = 0, approved_by = NULL
WHERE approved_by = 'judge'
  AND title_id IN (
    'casa-grande-2014',
    'estomago-a-gastronomic-story-2008',
    'heli-2013',
    'martin-hache-1997',
    'rat-fever-2012',
    'the-violin-2005',
    'the-year-my-parents-went-on-vacation-2006'
  );
