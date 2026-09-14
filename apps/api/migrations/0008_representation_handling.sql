-- Adds an honesty layer this taxonomy was missing: a title can earn an inclusion_type
-- tag and still deserve scrutiny of *how* it represents Latino people or communities
-- (e.g. a narco-drama with a Latina star/EP, or a sitcom praised at the time whose
-- humor reads as stereotyping in retrospect). Previously the only place to record that
-- was a PR description, which disappears from ordinary discovery and can't be queried.
--
-- representation_handling on titles: NULL = standard (no known concern). A separate
-- child table for notes, same shape as title_tags, because a title can carry more than
-- one caveat and each needs its own sourcing - a single text column couldn't hold that.
--
-- packages/core/src/taxonomy.ts (REPRESENTATION_HANDLINGS, CONTEXT_NOTE_CATEGORIES) is
-- the source of truth for the vocabulary these CHECK constraints mirror.
ALTER TABLE titles ADD COLUMN representation_handling TEXT
  CHECK (representation_handling IS NULL OR representation_handling IN ('contextual', 'critical_archive'));

CREATE TABLE title_context_notes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id       TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  category       TEXT NOT NULL CHECK (category IN (
                    'crime_stereotype_risk', 'employer_centered_framing',
                    'era_specific_stereotyping', 'authorship_gap', 'historical_context'
                  )),
  status         TEXT NOT NULL CHECK (status IN ('confirmed', 'review_required')),
  summary        TEXT NOT NULL,
  sources        TEXT NOT NULL DEFAULT '[]',   -- JSON array of BlurbSource
  display_policy TEXT NOT NULL DEFAULT 'public' CHECK (display_policy IN ('public', 'curator_only')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_title_context_notes_title ON title_context_notes (title_id);
