-- Static reference data: the tag vocabulary and the four launch collections.

INSERT INTO tags (kind, slug, label) VALUES
  ('inclusion_type','led_by','Latino-directed'),
  ('inclusion_type','created_by','Latino-created'),
  ('inclusion_type','about_community','About the community'),
  ('inclusion_type','breakthrough','Breakthrough first'),
  ('theme','immigration','Immigration'),
  ('theme','family','Family'),
  ('theme','identity','Identity'),
  ('theme','labor','Labor'),
  ('theme','diaspora','Diaspora'),
  ('theme','coming_of_age','Coming of age'),
  ('theme','borderlands','Borderlands'),
  ('theme','class','Class'),
  ('theme','faith','Faith'),
  ('theme','music','Music'),
  ('theme','activism','Activism'),
  ('theme','queer_latino','Queer Latino'),
  ('theme','indigenous','Indigenous'),
  ('theme','afro_latino','Afro-Latino');

INSERT INTO collections (id, slug, title, description, kind, smart_query) VALUES
  ('core-canon','core-canon','Core Canon',
   'The essential Latino-led films and series — the shortlist to start from.','curated',NULL),
  ('border-stories','border-stories','Border Stories',
   'Migration, the borderlands, and life across two countries.','smart',
   '{"theme":"borderlands"}'),
  ('latina-directors','latina-directors','Latina Directors',
   'Feature work directed by Latina filmmakers.','smart',
   '{"inclusionType":"led_by"}'),
  ('breakthrough-firsts','breakthrough-firsts','Breakthrough Firsts',
   'Titles that broke ground — in representation, awards, or the box office.','smart',
   '{"inclusionType":"breakthrough"}');
