# Title selection criteria

A checklist for adding titles to `canon.seed.json`, distilled from real judgment calls
made (and one real correction caught) while growing the catalog from 16 to 36+ titles.
Every rule here traces back to an actual title where the easy answer was wrong.

## The bar

A title needs **at least one genuinely earned `inclusion_type`** — not "a Latino person
is involved somewhere," but a specific, checkable credit. Six exist:

| Type | What it actually requires |
|---|---|
| `led_by` | A Latino **director or showrunner held primary creative control**. A Latino co-director under a non-Latino primary director does *not* count (see below). |
| `created_by` | A Latino writer has an actual **writing credit** on the produced work — screenplay or story-by, not just being the source novelist if someone else adapted it. |
| `about_community` | The Latino community/experience is **the actual subject**, not a backdrop. Test: if you removed that context, would the story still make sense? |
| `breakthrough` | A **documented, citable first** — an award, a Registry induction, a verified box-office/streaming record. Not "this feels significant." |
| `starring` | A Latino actor holds the **lead/title role**, in a work that isn't otherwise `about_community`. For when the performer is the only real connection. |
| `produced_by` | A Latino producer held **significant creative/executive control**, distinct from directing or writing. |

## Verification steps, in order

1. **List every credited director, writer, and notable producer** — not just the most
   famous name attached to the project. (*Frida* was first tagged with no `created_by`
   because only the director, Julie Taymor, was checked — the full writing credit
   included Gregory Nava, already in this catalog three times over. Missed on the first
   pass, caught on review.)
2. **Verify heritage from an actual source, never from a surname.** A Spanish name
   doesn't mean Latin American heritage. *In the Time of the Butterflies*' director,
   Mariano Barroso, is Spanish (Madrid) — Spain is not Latin America, and doesn't
   qualify under this taxonomy regardless of the film's subject or language.
3. **A co-director under a primary non-Latino director doesn't earn `led_by`.** *Coco*
   (Adrian Molina co-directed under Lee Unkrich) and *Encanto* (Charise Castro Smith
   co-directed under Byron Howard) both stay `about_community`/`breakthrough` only —
   no `led_by` — for this reason. It's a real distinction worth being consistent about,
   not a technicality to route around.
4. **`about_community` needs the story to center Latino experience, not just be set in a
   Latin American country or cast a Latino actor.** *Machete* (immigration politics
   drives the plot) earns it; *From Dusk till Dawn* and *Once Upon a Time in Mexico*
   (Robert Rodriguez directed both, genre spectacle set partly/wholly in Mexico) don't —
   removing the Mexico setting wouldn't break either story the way it would *Machete*.
5. **Don't stretch a theme or tag to make something look fuller than it is.**
   *Y Tu Mamá También* was considered for `borderlands` (a road trip through Mexico)
   and dropped — no border crossing, no migration, not actually a borderlands story.
   A thin, technically-defensible tag is worse than no tag; it's exactly the kind of
   padding this project spent real effort *removing* from Border Stories earlier.
6. **When genuinely uncertain, say so and leave it out — don't guess either direction.**
   *A Better Life*'s `indigenous` theme tag was flagged as questionable but deliberately
   left untouched: not being sure it's wrong isn't grounds to remove it, and not being
   sure it's right isn't grounds to add more like it elsewhere.
7. **Watch for over-concentrating one director/creator within a single batch.** Growing
   the catalog is about breadth. *Once Upon a Time in Mexico* was left out partly
   because it would have been the fourth Robert Rodriguez title in one batch (alongside
   *El Mariachi*, *Machete*, *Spy Kids*) — a redundancy concern on top of the thin
   `about_community` fit, not the deciding factor alone, but a real one.
8. **A large secondary "AI-suggested" or "generated" list is a research source, not an
   import queue.** Run every title on it through steps 1-7 individually before it goes
   anywhere near the seed file. Several such lists reviewed this way turned out to
   overstate creative-leadership claims (a coded-Latino character isn't the same as a
   Latino writer/director) that steps 1-2 above would have caught.

## What this doesn't resolve

**Scope of "Latino."** This taxonomy has consistently treated it as Hispanic/Latin
American heritage — Spanish-speaking Latin America plus the US Latino diaspora — and
excluded Spain (Iberian, European) on that basis. Portuguese-speaking Brazil is a real
edge case that hasn't come up yet (e.g. a Brazilian director like Walter Salles) and
isn't settled either way. If it comes up, decide once and apply it consistently rather
than case-by-case.
