import seedFile from "./seed/canon.seed.json" with { type: "json" };
import type { Env, IngestParams } from "./bindings.js";
import type { SeedTitle } from "./seed-diff.js";
import { jobIdFor } from "./workflow-rules.js";

/**
 * The daily ingest queue. Merging a seed PR used to ingest its new titles immediately
 * (ingest-new-titles.yml), so ingest volume was set by merge timing: two content PRs on
 * one UTC day meant two days' worth of 70B classify + blurb calls against the shared
 * 10k-neuron budget (it happened: #240 and #242 both merged on 2026-09-25). Seed PRs now
 * merge any time; once a day the cron takes the next few seed entries that aren't live
 * and starts their Workflows. Re-pinned entries (a corrected tmdbId) count as not live,
 * so corrections drain through the same queue.
 */

const DEFAULT_PER_DAY = 5;

export interface LiveTitle {
  tmdbId: number;
  kind: string;
}

export interface JobRow {
  id: string;
  status: string;
  params: string | null;
}

export interface QueuePlan {
  /** Next entries to ingest, in seed-file order, at most `limit`. */
  picked: SeedTitle[];
  /** Everything eligible, including what's past today's limit. */
  eligible: number;
  /** Not-live entries the queue won't send, and why - each needs a human, not a retry. */
  held: { ref: string; reason: string }[];
}

/** TMDB ids are per media type; specials are movies. */
const key = (kind: string, tmdbId: number): string => `${kind === "series" ? "tv" : "movie"}:${tmdbId}`;

const pinnedId = (params: string | null): number | undefined => {
  if (!params) return undefined;
  try {
    return (JSON.parse(params) as { tmdbId?: number }).tmdbId;
  } catch {
    return undefined;
  }
};

/**
 * Which seed entries to ingest next. An entry is eligible when it pins a tmdbId that no
 * live title has, and no job has already tried that same id - a job with the same pin
 * is in flight, in review, or failed a check a retry can't fix (wrong film, bad pin).
 * A job with a *different* pin is an earlier attempt the seed has since corrected.
 * Unpinned entries are skipped: every new entry must pin (seed-validate.ts), and the
 * old unpinned ones are already live.
 */
export function planQueue(seed: SeedTitle[], live: LiveTitle[], jobs: JobRow[], limit: number): QueuePlan {
  const liveKeys = new Set(live.map((t) => key(t.kind, t.tmdbId)));
  const jobsById = new Map(jobs.map((j) => [j.id, j]));
  const eligible: SeedTitle[] = [];
  const held: QueuePlan["held"] = [];

  for (const t of seed) {
    if (t.tmdbId === undefined || liveKeys.has(key(t.kind, t.tmdbId))) continue;
    const job = jobsById.get(jobIdFor(t.ref));
    if (job && pinnedId(job.params) === t.tmdbId) {
      const reason =
        job.status === "error"
          ? "failed with this tmdbId - see GET /jobs"
          : job.status === "done"
            ? "ingested, but no live title has this tmdbId - check for a slug collision"
            : `job ${job.status}`;
      held.push({ ref: t.ref, reason });
      continue;
    }
    eligible.push(t);
  }
  return { picked: eligible.slice(0, limit), eligible: eligible.length, held };
}

/**
 * A retry the queue should own instead: the seed now pins this ref to a different
 * tmdbId than the job tried. Replaying the old params re-runs a known-wrong pin (or an
 * unpinned search that already failed) - found 2026-09-25, when the nightly retry replayed
 * The Battle of Chile and La vendedora de rosas unpinned after #244 had pinned both. The
 * queue sees the new pin as eligible and ingests it. Refs the seed doesn't list (manual
 * /ingest calls) are never stale.
 */
export function isStaleRetry(params: Pick<IngestParams, "ref" | "tmdbId">, seed: SeedTitle[]): boolean {
  const entry = seed.find((t) => t.ref === params.ref);
  return entry !== undefined && entry.tmdbId !== undefined && entry.tmdbId !== params.tmdbId;
}

export const seedTitles = (): SeedTitle[] => (seedFile as { titles: SeedTitle[] }).titles;

export function perDayLimit(env: Env): number {
  const n = Number(env.INGEST_QUEUE_PER_DAY);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_PER_DAY;
}

export async function loadQueuePlan(env: Env): Promise<QueuePlan> {
  const [live, jobs] = await Promise.all([
    env.DB.prepare("SELECT tmdb_id AS tmdbId, kind FROM titles WHERE tmdb_id IS NOT NULL").all<LiveTitle>(),
    env.DB.prepare("SELECT id, status, params FROM ingest_jobs").all<JobRow>(),
  ]);
  return planQueue(seedTitles(), live.results, jobs.results, perDayLimit(env));
}

/** The cron's step: start today's batch. Idempotent within a day only via job state - run it once a day. */
export async function runIngestQueue(env: Env): Promise<void> {
  const plan = await loadQueuePlan(env);
  for (const t of plan.picked) {
    const { ref, title, year, kind, tmdbId, seedInclusionTypes, aliases } = t;
    const params: IngestParams = { ref, title, year, kind, tmdbId, seedInclusionTypes, aliases };
    await env.INGEST_WORKFLOW.create({ params });
  }
  console.warn(
    JSON.stringify({
      event: "ingest.queue",
      started: plan.picked.map((t) => t.ref),
      remaining: plan.eligible - plan.picked.length,
      held: plan.held.length,
    }),
  );
}
