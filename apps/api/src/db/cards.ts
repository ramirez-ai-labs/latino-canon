import {
  MODEL_TAG_DISPLAY_THRESHOLD,
  type InclusionType,
  type PersonGender,
  type RankedHit,
  type RepresentationHandling,
  type Theme,
  type TitleKind,
  type TitleCard,
} from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { visibilityGateSql } from "../search/filters.js";

interface CardRow {
  id: string;
  kind: TitleKind;
  title: string;
  year_start: number;
  year_end: number | null;
  poster_key: string | null;
  popularity: number;
  runtime: number | null;
  oscar_win: string | null;
  director: string | null;
  director_gender: PersonGender | null;
  lead_actor: string | null;
  lead_actor_gender: PersonGender | null;
  blurb: string | null;
  inclusion_types: string | null; // "slug:conf,slug:conf"
  themes: string | null;
  representation_handling: RepresentationHandling | null;
}

/**
 * Hydrate ranked ids into cards in ONE query (avoids N+1). Preserves the fusion order.
 */
export async function hydrateCards(env: Env, hits: RankedHit[]): Promise<TitleCard[]> {
  if (hits.length === 0) return [];
  const ids = hits.map((h) => h.titleId);
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const gate = visibilityGateSql("t", ids.length);

  const sql = `
    SELECT
      t.id, t.kind, t.title, t.year_start, t.year_end, t.poster_key, t.popularity, t.runtime, t.oscar_win,
      t.representation_handling,
      -- led_by's own definition is "a Latino director OR SHOWRUNNER held primary
      -- creative control" - a series credited only with creators, never a formal
      -- director role, still earns led_by, so this must fall back to the first-
      -- ordered creator credit rather than leaving director/director_gender null.
      -- Found live: "The Ministry of Time" (creator-only credits) showed "-" for its
      -- byline and would default to "Latino-directed" over "Latina-directed" for a
      -- female showrunner, since a null director_gender silently reads as male.
      (SELECT p.name FROM credits c JOIN people p ON p.id = c.person_id
        WHERE c.title_id = t.id AND c.role IN ('director', 'creator')
        ORDER BY (c.role != 'director'), c.ord LIMIT 1) AS director,
      (SELECT p.gender FROM credits c JOIN people p ON p.id = c.person_id
        WHERE c.title_id = t.id AND c.role IN ('director', 'creator')
        ORDER BY (c.role != 'director'), c.ord LIMIT 1) AS director_gender,
      (SELECT p.name FROM credits c JOIN people p ON p.id = c.person_id
        WHERE c.title_id = t.id AND c.role = 'cast' ORDER BY c.ord LIMIT 1) AS lead_actor,
      (SELECT p.gender FROM credits c JOIN people p ON p.id = c.person_id
        WHERE c.title_id = t.id AND c.role = 'cast' ORDER BY c.ord LIMIT 1) AS lead_actor_gender,
      b.text AS blurb,
      (SELECT group_concat(g.slug || ':' || tt.confidence)
        FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
        WHERE tt.title_id = t.id AND g.kind = 'inclusion_type') AS inclusion_types,
      (SELECT group_concat(g.slug || ':' || tt.confidence)
        FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
        WHERE tt.title_id = t.id AND g.kind = 'theme') AS themes
    FROM titles t
    LEFT JOIN blurbs b ON b.title_id = t.id AND b.approved = 1
    WHERE t.id IN (${placeholders})
      AND ${gate.clause}
  `;

  const { results } = await env.DB.prepare(sql).bind(...ids, ...gate.params).all<CardRow>();
  const byId = new Map(results.map((r) => [r.id, r]));
  const scoreById = new Map(hits.map((h) => [h.titleId, h.score]));

  return ids
    .map((id) => byId.get(id))
    .filter((r): r is CardRow => Boolean(r))
    .map((r) => {
      const inclusionTagsWithConf = parseTagsWithConfidence(r.inclusion_types);
      return {
        id: r.id,
        kind: r.kind,
        title: r.title,
        yearStart: r.year_start,
        yearEnd: r.year_end,
        director: r.director,
        directorGender: r.director_gender,
        leadActor: r.lead_actor,
        leadActorGender: r.lead_actor_gender,
        posterKey: r.poster_key,
        blurbTeaser: r.blurb ? truncate(r.blurb, 140) : null,
        inclusionTypes: inclusionTagsWithConf.map((t) => t.slug) as InclusionType[],
        inclusionTypesWithConfidence: inclusionTagsWithConf,
        themes: parseTags(r.themes) as Theme[],
        score: scoreById.get(r.id) ?? 0,
        representationHandling: r.representation_handling,
        runtime: r.runtime,
        oscarWin: r.oscar_win,
      };
    });
}

function parseTags(concat: string | null): string[] {
  if (!concat) return [];
  return concat
    .split(",")
    .map((pair) => {
      const [slug, conf] = pair.split(":");
      return { slug, conf: Number(conf) };
    })
    .filter((t) => t.slug && t.conf >= MODEL_TAG_DISPLAY_THRESHOLD)
    .map((t) => t.slug as string);
}

function parseTagsWithConfidence(
  concat: string | null,
): Array<{ slug: InclusionType | Theme; confidence: number }> {
  if (!concat) return [];
  return concat
    .split(",")
    .map((pair) => {
      const [slug, conf] = pair.split(":");
      return { slug: slug as InclusionType | Theme, confidence: Number(conf) };
    })
    .filter((t): t is { slug: InclusionType | Theme; confidence: number } => t.slug !== undefined && t.confidence >= MODEL_TAG_DISPLAY_THRESHOLD);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}
