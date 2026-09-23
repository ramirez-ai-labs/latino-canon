/**
 * The operational definition of "Latino-focused". This is the conceptual core of the
 * product: a title qualifies for the canon iff it carries >= 1 inclusion_type tag.
 * The classifier (apps/ingest) proposes these; an editor can override.
 */

export const INCLUSION_TYPES = [
  "led_by",
  "created_by",
  "about_community",
  "breakthrough",
  "starring",
  "produced_by",
] as const;
export type InclusionType = (typeof INCLUSION_TYPES)[number];

export const INCLUSION_TYPE_LABELS: Record<InclusionType, string> = {
  led_by: "Latino-directed",
  created_by: "Latino-created",
  about_community: "About the community",
  breakthrough: "Breakthrough first",
  starring: "Latino-led cast",
  produced_by: "Latino-produced",
};

export const PERSON_GENDERS = ["female", "male", "non_binary"] as const;
export type PersonGender = (typeof PERSON_GENDERS)[number];

/**
 * led_by's label is gendered when the credited director's gender is known: "Latina" for
 * a confirmed female director, "Latino" otherwise. "Latino" already does double duty as
 * both the specific male term and this taxonomy's gender-neutral default everywhere else
 * (Latino Canon, Latino-led cast) - so a male, non-binary, or unknown/unspecified
 * director (TMDB's gender field is self-reported and frequently unset) all fall to the
 * same "Latino-directed" wording without needing a separate unknown-gender bucket. Only
 * used for led_by - the other inclusion types aren't tied to one specific credited
 * person's gender the same direct way.
 */
export function ledByLabel(directorGender: PersonGender | null | undefined): string {
  return directorGender === "female" ? "Latina-directed" : "Latino-directed";
}

export const INCLUSION_TYPE_DEFINITIONS: Record<InclusionType, string> = {
  led_by:
    "A Latino director or showrunner held primary creative control of the work.",
  created_by:
    "A Latino writer or creator originated the work (created-by / written-by credit).",
  about_community:
    "The work centers Latino characters, stories, or experience, regardless of who made it.",
  breakthrough:
    "The work is a documented 'first' — in representation, a major award, or a box-office / audience milestone.",
  starring:
    "A Latino actor holds the lead/title role, even when the work's story or other creative leadership isn't otherwise Latino-focused (e.g. a Latino star in a genre ensemble). Distinct from about_community, which is about what the story centers, not who's cast.",
  produced_by:
    "A Latino producer held significant creative or executive control over the work, distinct from directing (led_by) or writing (created_by) it.",
};

/**
 * Theme tags. Kept deliberately small and orthogonal — expand only with evidence from
 * the data that a distinction matters. Used both as search facets and classifier labels.
 */
export const THEMES = [
  "immigration",
  "family",
  "identity",
  "labor",
  "diaspora",
  "coming_of_age",
  "borderlands",
  "class",
  "faith",
  "music",
  "activism",
  "queer_latino",
  "indigenous",
  "afro_latino",
] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  immigration: "Immigration",
  family: "Family",
  identity: "Identity",
  labor: "Labor",
  diaspora: "Diaspora",
  coming_of_age: "Coming of age",
  borderlands: "Borderlands",
  class: "Class",
  faith: "Faith",
  music: "Music",
  activism: "Activism",
  queer_latino: "Queer Latino",
  indigenous: "Indigenous",
  afro_latino: "Afro-Latino",
};

export type TagSource = "seed" | "model" | "editor";

/** Below this confidence the tag is hidden from the UI and sent to the review queue. */
export const MODEL_TAG_DISPLAY_THRESHOLD = 0.6;

/**
 * TMDB genre names, restricted to the subset that actually shows up in this catalog -
 * not the full ~19-genre TMDB list, most of which (Western, TV Movie, Talk) never
 * apply here. Stored on titles.genres as free-text JSON (TMDB's own genre names,
 * not ids), so this list is a filter/prompt vocabulary, not a DB-enforced enum -
 * an ingested title can carry a genre name outside this list without erroring, it
 * just won't appear as a pickable filter option or a rewriteQuery target.
 */
export const GENRES = [
  "Animation",
  "Family",
  "Comedy",
  "Drama",
  "Documentary",
  "Music",
  "Romance",
  "Crime",
  "Thriller",
  "Action",
  "Horror",
  "War",
  "History",
] as const;
export type Genre = (typeof GENRES)[number];

/**
 * A softer signal than the classify prompt's CURATION GATE (which rejects hardcore
 * adult/pornographic content outright): this is for content that legitimately belongs
 * in the canon but carries mature themes (drug trafficking, explicit sexuality,
 * graphic violence) that shouldn't rank for a family/kids-audience query. `null` means
 * "not yet classified" (same convention as people.gender), not "general audience" -
 * treat null as unknown/neutral, never as a confirmed-safe signal.
 */
export const CONTENT_ADVISORIES = ["general", "mature"] as const;
export type ContentAdvisory = (typeof CONTENT_ADVISORIES)[number];

/**
 * A title can earn an inclusion_type and still deserve scrutiny of how it represents
 * Latino people or communities — e.g. a narco-drama with a Latina lead and executive
 * producer, or a sitcom whose creator was praised for representation at the time but
 * whose humor reads as stereotyping in retrospect. `null` (no row) means "standard":
 * no known representation concern. This is deliberately not a rejection mechanism —
 * a contextual/critical_archive title is still in the canon, just labeled honestly
 * instead of presented as an uncomplicated recommendation.
 */
export const REPRESENTATION_HANDLINGS = ["contextual", "critical_archive"] as const;
export type RepresentationHandling = (typeof REPRESENTATION_HANDLINGS)[number];

export const REPRESENTATION_HANDLING_LABELS: Record<RepresentationHandling, string> = {
  contextual: "Contextual entry",
  critical_archive: "Critical archive entry",
};

export const REPRESENTATION_HANDLING_DEFINITIONS: Record<RepresentationHandling, string> = {
  contextual:
    "Included for its relevance to Latino representation; the work's framing (of a character, a community, or a role) warrants a caveat alongside the standard tags.",
  critical_archive:
    "Included as a documented, discussed case in the history of Latino representation — the point of the record is the discussion, not an uncomplicated recommendation.",
};

/**
 * Grows the same way INCLUSION_TYPES/THEMES did: add a category only when a real
 * title needs one that doesn't fit, not speculatively.
 */
export const CONTEXT_NOTE_CATEGORIES = [
  "crime_stereotype_risk",
  "employer_centered_framing",
  "era_specific_stereotyping",
  "authorship_gap",
  "historical_context",
] as const;
export type ContextNoteCategory = (typeof CONTEXT_NOTE_CATEGORIES)[number];

export const CONTEXT_NOTE_CATEGORY_LABELS: Record<ContextNoteCategory, string> = {
  crime_stereotype_risk: "Crime/stereotype risk",
  employer_centered_framing: "Employer-centered framing",
  era_specific_stereotyping: "Era-specific stereotyping",
  authorship_gap: "Authorship gap",
  historical_context: "Historical context",
};
