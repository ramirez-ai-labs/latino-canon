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
2. **Verify heritage from an actual source, never from a surname.** A Spanish-sounding
   name doesn't by itself tell you someone's actual heritage — confirm it, the same
   way you'd confirm any other credit. Spain/Spanish (Iberian) heritage **does**
   qualify under this taxonomy (see "Scope of 'Latino'" below) — this project treats
   "Latino" as Hispanic broadly, not narrowed to Latin America only.
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
9. **`led_by`/`created_by` don't require `about_community` as a companion tag — they're
   independent credits with their own bar, not a package deal.** *Apocalypse Z: The
   Beginning of the End* and *Agent Zeta* were both wrongly excluded in an earlier pass
   on the reasoning that a confirmed-Spanish director's genre film (zombie horror, spy
   thriller) needed `about_community` too or `led_by` alone was "too thin" — an
   inconsistent standard that was never applied to, say, *No Manches Frida* (`led_by` +
   `starring`, no `about_community`, added without issue in the same batch). The bar
   for `led_by` is just "a confirmed Latino director held primary creative control" —
   genre or subject matter doesn't change that. Caught on review; both titles added.
   This doesn't retroactively bless every older exclusion built on similar reasoning
   (e.g. *From Dusk till Dawn*) — those stay flagged rather than silently reopened.
10. **Pin `tmdbId` on every new entry — CI rejects one without it**
    (`apps/ingest/src/seed-validate.ts`). Find the film on themoviedb.org and confirm
    its year and director match what steps 1-2 verified. Without a pin, ingest resolves
    the title by exact-title search: TMDB's English titles miss Spanish/Portuguese seed
    titles entirely, and a namesake from another decade gets accepted (*Los olvidados*
    (1950) went live as a 2014 film). Ingest also rejects any match more than 2 years
    from the seed year, or whose TMDB title and original title don't resemble the seed
    title or an alias — 28 of 90 pins from a generated research batch pointed at
    unrelated works (*Heli* at a 1968 cartoon). If TMDB knows the film only by a
    translation (*Blood In Blood Out* → *Bound by Honor*), add that as an alias.
11. **Removing a title means listing it in `removed`** at the bottom of the seed file,
    with a reason (wrong film, failed verification, duplicate) — CI rejects a title that
    just disappears. That's how merges silently dropped seven Phase 1 entries.

## Deferred, pending TMDB data

Not editorial exclusions — these pass verification but can't be ingested yet because
TMDB hasn't populated a `release_date` for them (`status: "Planned"` on TMDB, i.e. not
yet considered released). `fetchTmdbDetails` hard-requires a derivable year and throws
otherwise; there's no code fix for this, since the data genuinely isn't there yet.
Revisit once TMDB updates the record — a `force: true` re-POST will pick it up then.

| Title | Verified tags (ready to apply once ingestable) |
|---|---|
| *Suárez* (2026) | `about_community`, `produced_by` (Wilmer Valderrama) |
| *20 Pounds to Happiness* (2025) | `led_by`, `created_by`, `starring`, `about_community` |

## Considered and excluded

Titles specifically evaluated and left out, with why — check here before re-researching
one of these from scratch.

| Title | Why it was considered | Why it's out |
|---|---|---|
| *From Dusk till Dawn* (1996) | Robert Rodriguez directed | Tarantino wrote it, not Rodriguez or any Latino writer; not about Latino experience or community — genre thriller set partly in Mexico. `led_by` alone would be a thin, technicality-only claim. |
| *Once Upon a Time in Mexico* (2003) | Rodriguez wrote/directed/scored solo, same as *El Mariachi*/*Machete* | Genre spectacle (CIA agent vs. cartel-backed coup), not substantive `about_community` engagement; would also have been a fourth Rodriguez title in one batch alongside *El Mariachi*, *Machete*, and *Spy Kids* — over-concentrates one director at the expense of the breadth this catalog is for. |
| *Spider-Man: Into the Spider-Verse* (2018) | Miles Morales is coded Afro-Puerto Rican | No credited director or writer is Latino, and voice actor Shameik Moore isn't either — unlike *Coco*/*Encanto*, there's no actual person to hang a tag on. |
| *Frybread Face and Me* (2023) | Surfaced in a Netflix "latino culture" search result set | Not Latino at all — it's a Navajo coming-of-age film; director Billy Luther is Navajo/Hopi/Laguna Pueblo. Indigenous American and Latino are different categories; this is a real example of a streaming platform's own search surfacing a false positive by thematic proximity (coming-of-age, Indigenous identity) rather than actual heritage. |
| *The House of the Spirits* (1993) | Based on Isabel Allende's (Chilean) novel; Antonio Banderas in the cast | Written and directed solo by Bille August (Danish) — Allende is only the source novelist, explicitly excluded from `created_by` by rule #1. Banderas is billed fifth in an ensemble (Irons, Streep, Close, Ryder, Banderas, Redgrave), not the lead — doesn't meet `starring`'s bar either. No Latino creative control anywhere on the production. |
| *The Road to El Dorado* (2000) | Set in a mythical pre-Columbian Mesoamerican city; Rosie Perez and Edward James Olmos in the voice cast | Directed by Don Paul and Bibo Bergeron, written by Ted Elliott and Terry Rossio - no Latino creative control. The leads are Kenneth Branagh and Kevin Kline; Perez (Chel) and Olmos (the Chief) are billed third and fifth in supporting roles, so no `starring` (same bar as *The House of the Spirits*). The Indigenous Mesoamerican setting, seen through two Spanish con men, isn't Latino community experience (see *Frybread Face and Me*). |

*The Mask of Zorro* was excluded here in an earlier pass on the grounds that Antonio
Banderas is Spanish, not Latin American, and Spain didn't qualify under this taxonomy
at the time. That scope decision changed (see below) — Spain now qualifies, so this
exclusion no longer holds and the title needs re-review under the current rule rather
than staying flagged as rejected.

## Scope of "Latino"

**Decided:** this taxonomy treats "Latino" as Hispanic broadly — Spain/Spanish
(Iberian) heritage qualifies, alongside Latin America and the US Latino diaspora. This
reverses an earlier, narrower reading (Latin-America-only, Spain excluded) that had
been applied by default in the absence of an explicit call; that default excluded
*In the Time of the Butterflies*' director (Mariano Barroso) and *Tortilla Soup*'s
director (María Ripoll) from `led_by`, and excluded *The Mask of Zorro* entirely.
Those need re-review under the current rule (see the seed file's own history for
what's actually been fixed vs. still pending).

**Decided: Portuguese-speaking Brazil qualifies too.** Extends the same logic as the
Spain decision — heritage, not a specific colonial language, is what the taxonomy
gates on. Confirmed Brazilian directors (e.g. Gabriel Mascaro, Kleber Mendonça Filho)
earn `led_by`/`created_by` the same way a confirmed Mexican or Cuban director would.

**Decided (2026-09-25): Haiti is out of scope.** The Brazil decision widened scope by
shared Iberian heritage, not by geography; Haitian cinema is Francophone/Kreyòl
Caribbean, not Hispanic or Lusophone, so it isn't Latino in this taxonomy's sense. The
seven Haitian titles on the generated Latin American cinema list (*Moloch Tropical*,
*Murder in Pacot*, *Freda* and others) are excluded on scope, not quality. A Haitian or
Haitian-diaspora title still qualifies through a separately verified Latino credit (a
Dominican co-director, say), like any other work.

**Decided: `about_community` isn't narrowed to U.S. Latino/diaspora stories.**
Rule #4's test ("the Latino community/experience is the actual subject... would the
story still make sense without that context?") was never actually written with a
U.S.-only scope — a story that centers a specific Latin American community's own
experience (e.g. *A Poet*, set entirely in Medellín's art scene) passes the test as
written just as much as a U.S.-set immigrant story does. This was a real, live
question (not hypothetical) once verification turned up genuine Latin American
festival cinema with confirmed Latino creative leadership and a community-centered
story — formalizing the reading the rule already implied rather than leaving it to
guess case-by-case.
