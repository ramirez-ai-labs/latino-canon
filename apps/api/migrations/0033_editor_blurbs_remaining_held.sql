-- Editor rewrites for the last 21 unapproved blurbs (2026-10-25), following 0032. Every
-- claim is taken from that title's own stored sources and cited inline.
-- What was wrong with them, beyond the v3 judge holding supported claims (see 0032)
-- - 13 credited only one of two co-directors, or neither. Each now credits every director source.
-- - "won N nominations" (Circo Gómez, Comparsa, Jaripeo). Nominations are received, not won.
-- - Uncited text or an unsupported "It matters…" sentence (Salsipuedes, The Fall, The Little
--   Priest, The Young and the Damned). The Fall's Silver Bear is in its synopsis, so it stays.
-- - Thin plot lines ("a film about Agustín and María") now carry the synopsis's substance.
-- Salsipuedes also gains a source, n1, for its Oscar submission: the English Wikipedia
-- article, which cites Prensa and Latin Post (both 2016-09-19). Wikipedia isn't news, but
-- BlurbSource has no better kind.
-- Judge columns are left as the record of what the judge said about the earlier text.

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Abandoned by her husband in New York City, Colombian native Mariana struggles to take care of herself and her two young children [s1]. Directed by Paola Mendoza [d0] and Gloria La Morte [d1], it won 6 awards [a1].'
WHERE title_id = 'between-us-2009';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'In 2004, advertising director Elsa Rosado faces a turbulent Christmas weekend, and in 2026 filmmaker Raúl Durán turns her story into a screenplay [s1]. Directed by Pedro Almodóvar [d0], it received 3 nominations [a1].'
WHERE title_id = 'bitter-christmas-2026';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'A painter who gives art therapy workshops, a young woman assaulted on her way home and a seamstress searching for her missing daughter come together through art to bring a rapist to justice [s1]. Directed by Leslie Ortiz [d0] and Gabriela Cruz [d1].'
WHERE title_id = 'blurred-women-2022';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Filiberto Gómez and his family of circus performers do whatever it takes to keep their circus afloat [s1]. Directed by Sergio Lebrija [d0] and Ornella Antista [d1], it received 1 nomination [a1].'
WHERE title_id = 'circo-gomez-2026';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'In a Guatemalan neighbourhood scared into silence, two sisters lead a rebellion of joy, art and radical truth [s1]. Directed by Vickie Curtis [d0] and Doug Anderson [d1], it won 4 awards and received 2 nominations [a1].'
WHERE title_id = 'comparsa-2025';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'In the Panamanian mountain town of Bambito, Federico struggles to keep his family together when he chooses to undergo gender reassignment surgery [s1]. Directed by Arturo Montenegro [d0], it won 44 awards [a1].'
WHERE title_id = 'everybody-changes-2019';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Best friends Ligia and Mayte plan the best quinceañera party ever, until Ligia discovers she is pregnant with a creature that threatens everyone around her [s1]. Directed by Jack Zagha Kababie [d0] and Yossy Zagha [d1].'
WHERE title_id = 'fifteen-2026';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'A mother and daughter create a shared fantasy to explore their intertwined experiences of immigration, labor and womanhood [s1]. Directed by Carolina Gonzalez Valencia [d0].'
WHERE title_id = 'how-to-clean-a-house-in-ten-easy-steps-2026';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'A gifted young writer in 19th-century Mexico journeys into her subconscious and meets characters from her own spooky stories [s1]. Directed by Arturo Ambriz [d0] and Roy Ambriz [d1], it won 2 awards and received 10 nominations [a1].'
WHERE title_id = 'i-am-frankelda-2025';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Set against the jaripeo, a symbol of Mexican cowboy tradition and machismo, the film unveils a hidden world of queer desire and quiet rebellion [s1]. Directed by Rebecca Zweig [d0] and Efraín Mojica [d1], it received 2 nominations [a1].'
WHERE title_id = 'jaripeo-2026';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'A little girl dresses like a boy to join the gang her brother is in, in a story about the reality of young kids who join gangs [s1]. Directed by Fernando Espinoza [d0] and Alejandro Legaspi [d1], it won 3 awards [a1].'
WHERE title_id = 'juliana-1988';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'A prejudiced Franco-Peruvian woman opens a restaurant after her husband leaves her, and through it falls in love with the gastronomic and cultural diversity of Peru in the Lima of 1965 [s1]. Directed by Ricardo de Montreuil [d0], it won 20 awards [a1].'
WHERE title_id = 'mistura-2025';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Cusco radio host Fernando and his son dub classic animated clips into Quechua, an Indigenous language, until one of their dubs unexpectedly goes viral [s1]. Directed by Augusto Zegarra [d0], it won 12 awards [a1].'
WHERE title_id = 'runa-simi-2025';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Sent to the United States as a boy to keep him away from bad influences, Andres Pimienta returns ten years later and meets his father, Bobby, an encounter that will change his destiny [s1]. Directed by Ricardo Aguilar Navarro [d0] and Manuel Rodríguez [d1], it was Panama''s submission for the Academy Award for Best Foreign Language Film [n1].',
  sources = json_insert(sources, '$[#]', json_object(
    'kind', 'news',
    'ref', 'https://en.wikipedia.org/wiki/Salsipuedes_(film)',
    'quote', NULL,
    'id', 'n1',
    'text', 'Salsipuedes (2016) was selected as the Panamanian entry for the Best Foreign Language Film at the 89th Academy Awards, but it was not nominated.'
  ))
WHERE title_id = 'salsipuedes-2016';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'María watches over everyone, sleeps very little and works too much, and one day, on impulse, she decides to abandon the aging Agustín [s1]. Directed by Rodrigo Plá [d0], it won 21 awards [a1].'
WHERE title_id = 'the-delay-2012';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'An accident at a construction site sets one worker off on a struggle for justice that exposes the exploitation and class relations of a Brazil shaped by a decade of military-led modernisation [s1]. A sort of sequel to The Guns (1964), it won the Silver Bear at Berlin [s1]. Directed by Ruy Guerra [d0] and Nelson Xavier [d1].'
WHERE title_id = 'the-fall-1976';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Young priest Father Sebastián is assigned to a parish in San Jeronimo el Alto, where he gradually wins over an unwelcoming town through humor and by fighting a bull to save the town fiesta [s1]. Directed by Miguel M. Delgado [d0].'
WHERE title_id = 'the-little-priest-1964';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Two producers commissioned to make a short documentary about Rubén Santantonín, an elusive figure of the Argentine avant-garde, must make it with his former collaborator David Lamelas [s1]. Directed by David Lamelas [d0] and Ignacio Masllorens [d1].'
WHERE title_id = 'the-phantom-2026';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'Nine-year-old Milo studies the Malambo, a folk dance full of bravura, in a remote Argentinian village, but his only desire is to escape on a train to Buenos Aires [s1]. Directed by Lorenzo Ferro [d0] and Lucas A. Vignale [d1].'
WHERE title_id = 'the-river-train-2026';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'In the slums of Mexico City, a group of juvenile delinquents live a violent life, among them Pedro, whose morality is gradually corrupted and destroyed by the others [s1]. Directed by Luis Buñuel [d0].'
WHERE title_id = 'the-young-and-the-damned-1950';

UPDATE blurbs SET approved = 1, approved_by = 'editor',
  text = 'At a home for children, a little girl meets Joseph, a boy whose only dream is to have a yellow umbrella, and the encounter awakens his memories of the past [s1]. Directed by Helena Hilario [d0] and Mario Pece [d1], it won 8 awards [a1].'
WHERE title_id = 'umbrella-2020';
