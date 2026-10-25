-- Editor approval for three blurbs the v3 judge held although their sources support every
-- claim. Found reviewing the 24 unapproved blurbs (2026-10-24): the judge flagged
-- "The Match (2026) is directed by Juan Cabral" against a d0 source with that exact text,
-- and the Carmela and Caracas plot lines paraphrase their synopsis. The judge columns are
-- left as they are, the record of what the judge said about the earlier text.
-- Each blurb named only the first of two co-directors, so the second is added with its d1
-- citation. The Caracas line said she "leaves everything behind in Venezuela", which reads
-- as emigrating, and the synopsis doesn't say that.
UPDATE blurbs
SET text = 'Carmela and the Walkers is a film about a woman who provides shelter for Venezuelan migrants [s1]. The film is directed by Esteban Coloma [d0] and Luis Herrera [d1].',
    approved = 1,
    approved_by = 'editor'
WHERE title_id = 'carmela-and-the-walkers-2025';

UPDATE blurbs
SET text = 'It Would Be Night in Caracas is a film about a woman in Venezuela who leaves everything behind, even her own name, to survive [s1]. The film is directed by Mariana Rondón [d0] and Marité Ugás [d1].',
    approved = 1,
    approved_by = 'editor'
WHERE title_id = 'it-would-be-night-in-caracas-2025';

UPDATE blurbs
SET text = 'The film reconstructs the historic match Argentina vs England at the 1986 FIFA World Cup quarter-finals [s1]. The Match (2026) is directed by Juan Cabral [d0] and Santiago Franco [d1].',
    approved = 1,
    approved_by = 'editor'
WHERE title_id = 'the-match-2026';
