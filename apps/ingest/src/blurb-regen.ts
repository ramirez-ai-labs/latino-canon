import { GROUNDEDNESS_JUDGE_VERSION, blurbTextProblems, passesBlurbGate, stripCitations, type PersonGender } from "@latino-canon/core";
import type { Env } from "./bindings.js";
import { blurbForIngest, judgeBlurb, type BlurbTitle } from "./ai.js";
import { recordBlurbVerdict, writeBlurb } from "./persist.js";
import { fetchOmdbRatings } from "./sources/omdb.js";

/**
 * Rewrites blurbs written before the current prompt and gate (#261-#263) - the ones still
 * waiting for an editor, and approved ones whose text makes a claim no source supports or
 * shows its sources in the prose. The rule that keeps this safe: a rewrite replaces the
 * old blurb only when it passes the same gate new ingests do (v3 judge at 1.0, clean
 * citations). Otherwise the old blurb stays exactly as it was and the attempt is recorded
 * (blurbs.regen_attempted_at), so a visible blurb is never swapped for a worse one and the
 * daily batch moves on instead of re-spending on the same titles.
 *
 * Cost: one 70B blurb call plus a ~13-neuron judge call per title - run it in daily
 * batches under the budget rule (CLAUDE.md: one 70B job a day besides the queue, ~2k).
 */

export type RegenReason = "unapproved" | "significance" | "citations";

export interface BlurbRow {
  titleId: string;
  text: string;
  approved: number;
  approvedBy: string | null;
  regenAttemptedAt: string | null;
  popularity: number;
}

// The unsupported sentence the old "why it matters" prompt invited: 114 of 131 failing
// blurbs on the 2026-09-27 v3 run ("It matters as a portrayal of border life.").
const SIGNIFICANCE_CLAIM = /\bmatters?\b|\bpart of the latino film canon\b/i;

/** Retry a title the gate held only after this long - the prompt or sources may have changed. */
export const RETRY_AFTER_DAYS = 7;

export function regenReason(row: BlurbRow): RegenReason | null {
  if (row.approvedBy === "judge") return null; // already passed the current gate
  if (!row.approved) return "unapproved";
  if (SIGNIFICANCE_CLAIM.test(stripCitations(row.text))) return "significance";
  if (blurbTextProblems(row.text).length > 0) return "citations";
  return null;
}

const PRIORITY: Record<RegenReason, number> = { unapproved: 0, significance: 1, citations: 2 };

/**
 * Which blurbs to rewrite next: titles with no approved note first (a rewrite gives them
 * one), then approved notes with an unsupported claim, then citation-style problems; the
 * most popular first within each. Titles attempted within RETRY_AFTER_DAYS wait.
 */
export function pickCandidates(rows: BlurbRow[], now: Date, limit: number): (BlurbRow & { reason: RegenReason })[] {
  const cutoff = now.getTime() - RETRY_AFTER_DAYS * 86_400_000;
  return rows
    .map((r) => ({ ...r, reason: regenReason(r) }))
    .filter((r): r is BlurbRow & { reason: RegenReason } => r.reason !== null)
    .filter((r) => !r.regenAttemptedAt || Date.parse(`${r.regenAttemptedAt.replace(" ", "T")}Z`) < cutoff)
    .sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason] || b.popularity - a.popularity)
    .slice(0, limit);
}

async function loadBlurbTitle(env: Env, id: string): Promise<BlurbTitle | null> {
  const t = await env.DB.prepare("SELECT id, title, year_start, synopsis, imdb_id FROM titles WHERE id = ?")
    .bind(id)
    .first<{ id: string; title: string; year_start: number; synopsis: string | null; imdb_id: string | null }>();
  if (!t) return null;
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.tmdb_id, p.name, p.known_for_department, p.gender, c.role, c.character, c.ord
     FROM credits c JOIN people p ON p.id = c.person_id WHERE c.title_id = ? AND c.role = 'director' ORDER BY c.ord`,
  )
    .bind(id)
    .all<{ id: string; tmdb_id: number | null; name: string; known_for_department: string | null; gender: PersonGender | null; role: "director"; character: string | null; ord: number }>();
  return {
    id: t.id,
    title: t.title,
    yearStart: t.year_start,
    synopsis: t.synopsis,
    imdbId: t.imdb_id,
    credits: results.map((r) => ({
      person: { id: r.id, tmdbId: r.tmdb_id, name: r.name, knownForDepartment: r.known_for_department, gender: r.gender },
      role: r.role,
      character: r.character,
      order: r.ord,
    })),
  };
}

export interface RegenResult {
  considered: number;
  byReason: Record<RegenReason, number>;
  replaced: string[];
  held: { titleId: string; score: number | null; problems: string[]; unsupported: string[] }[];
  errors: string[];
  /** dryRun only: the titles the next run would rewrite, in order. */
  next?: { titleId: string; reason: RegenReason }[];
}

export async function regenerateBlurbs(env: Env, opts: { limit: number; dryRun: boolean }): Promise<RegenResult> {
  const { results } = await env.DB.prepare(
    `SELECT b.title_id AS titleId, b.text, b.approved, b.approved_by AS approvedBy,
            b.regen_attempted_at AS regenAttemptedAt, t.popularity
     FROM blurbs b JOIN titles t ON t.id = b.title_id`,
  ).all<BlurbRow>();
  const all = pickCandidates(results, new Date(), Number.MAX_SAFE_INTEGER);
  const byReason = { unapproved: 0, significance: 0, citations: 0 };
  for (const c of all) byReason[c.reason]++;
  const batch = all.slice(0, opts.limit);
  const out: RegenResult = { considered: all.length, byReason, replaced: [], held: [], errors: [] };
  if (opts.dryRun) return { ...out, next: batch.map((c) => ({ titleId: c.titleId, reason: c.reason })) };

  for (const c of batch) {
    try {
      const title = await loadBlurbTitle(env, c.titleId);
      if (!title) throw new Error("title not found");
      const awards = (await fetchOmdbRatings(env, title.imdbId).catch(() => null))?.awards ?? null;
      const blurb = await blurbForIngest(env, title, awards);
      const verdict = await judgeBlurb(env, blurb).catch(() => null);
      const problems = blurbTextProblems(blurb.result.text);
      const pass = verdict !== null && passesBlurbGate(verdict) && problems.length === 0;

      if (pass) {
        await writeBlurb(env, c.titleId, blurb);
        await recordBlurbVerdict(env, c.titleId, blurb.result.text, {
          score: verdict.score,
          judgeVersion: GROUNDEDNESS_JUDGE_VERSION,
          pass: true,
        });
        out.replaced.push(c.titleId);
      } else {
        out.held.push({ titleId: c.titleId, score: verdict?.score ?? null, problems, unsupported: verdict?.unsupported ?? [] });
      }
      await env.DB.prepare("UPDATE blurbs SET regen_attempted_at = datetime('now') WHERE title_id = ?").bind(c.titleId).run();
      console.warn(
        JSON.stringify({ event: "blurb.regenerate", titleId: c.titleId, reason: c.reason, outcome: pass ? "replaced" : "held", score: verdict?.score ?? null, problems }),
      );
    } catch (err) {
      out.errors.push(`${c.titleId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}
