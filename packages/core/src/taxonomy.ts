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
