-- One free-text field, not a full awards table: "what did it win, and when" is
-- enough for a badge + tooltip. See ROADMAP.md-adjacent discussion - can grow into
-- a real title_awards table later if award coverage expands past Oscars.
ALTER TABLE titles ADD COLUMN oscar_win TEXT;
