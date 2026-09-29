import type { Env } from "./bindings.js";

/**
 * The Workers AI budget rule, enforced (CLAUDE.md "Architecture decisions" #2): on top of
 * the daily ingest queue (~3.2k), at most one other 70B job a day, capped at ~2k; a full
 * groundedness run (~2.8k) waits for a day with no ingest. It lived only in docs until the
 * day after it was written, when a full groundedness run went out on a queue day
 * (2026-09-27) and the account ran near its 10k-neuron cap.
 *
 * Every 70B job records itself in `ai_budget_claims` (migration 0029), one row per kind per
 * UTC day. Ingests (the queue, a manual /ingest) always run - the queue is the budget the
 * rule is built around - and are recorded so later jobs see them. The optional jobs must
 * claim first. A refusal can be overridden with a written reason, and the override is
 * recorded next to the claim.
 */
export const INGEST_KINDS = ["ingest-queue", "ingest-manual"] as const;
export const OPTIONAL_KINDS = ["blurb-regen", "eval-groundedness", "eval-mcp-tools", "eval-classifier"] as const;
export type IngestKind = (typeof INGEST_KINDS)[number];
export type OptionalKind = (typeof OPTIONAL_KINDS)[number];
export type HeavyJobKind = IngestKind | OptionalKind;

/**
 * Jobs too big to share a day with the queue. The others (blurb regeneration's ~20/day,
 * the MCP tool-selection eval's ~1k, a sampled classifier eval) fit under the ~2k cap on
 * top of it.
 */
export const QUIET_DAY_KINDS: readonly OptionalKind[] = ["eval-groundedness"];

export type ClaimDecision = { allow: true; override: boolean } | { allow: false; reason: string };

export function isOptionalKind(kind: string): kind is OptionalKind {
  return (OPTIONAL_KINDS as readonly string[]).includes(kind);
}

/**
 * Pure: may an optional 70B job run today?
 * - The same kind again today is fine: blurb regeneration runs a day's batch in several
 *   calls of 10, and they are one job.
 * - A different optional kind already claimed today: refused (one 70B job a day).
 * - A full groundedness run (QUIET_DAY_KINDS) on a day with a queue run or manual ingest,
 *   or with queue work still waiting (the 08:00 cron will ingest): refused. The smaller
 *   jobs are allowed on ingest days - the old "never on an ingest day" rule blocked
 *   everything once the queue made every day an ingest day.
 * - A non-empty override reason turns a refusal into an allowed, recorded override.
 */
export function decideClaim(
  kind: OptionalKind,
  claimedToday: readonly string[],
  queueHasWork: boolean,
  overrideReason?: string,
): ClaimDecision {
  let refusal: string | null = null;
  const otherOptional = claimedToday.filter((k) => isOptionalKind(k) && k !== kind);
  const ingests = claimedToday.filter((k) => (INGEST_KINDS as readonly string[]).includes(k));
  if (claimedToday.includes(kind)) return { allow: true, override: false };
  const needsQuietDay = QUIET_DAY_KINDS.includes(kind);
  if (otherOptional.length > 0) {
    refusal = `today already has a 70B job (${otherOptional.join(", ")}); the budget rule allows one a day on top of the queue`;
  } else if (needsQuietDay && ingests.length > 0) {
    refusal = `today is an ingest day (${ingests.join(", ")}); a full ${kind} run (~2.8k) waits for a day with no ingest`;
  } else if (needsQuietDay && queueHasWork) {
    refusal = `the ingest queue has titles waiting, so today's 08:00 cron will ingest; a full ${kind} run waits for a day with no queue work`;
  }
  if (refusal === null) return { allow: true, override: false };
  if (overrideReason && overrideReason.trim().length > 0) return { allow: true, override: true };
  return { allow: false, reason: refusal };
}

/** Today's UTC day, the budget's reset boundary (Workers AI resets at 00:00 UTC). */
export function budgetDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function claimsToday(env: Env, day = budgetDay()): Promise<{ kind: string; claimedAt: string; reason: string | null; override: number }[]> {
  const { results } = await env.DB.prepare(
    "SELECT kind, claimed_at AS claimedAt, reason, override FROM ai_budget_claims WHERE day = ?1 ORDER BY claimed_at",
  )
    .bind(day)
    .all<{ kind: string; claimedAt: string; reason: string | null; override: number }>();
  return results;
}

/** Records a job that runs regardless (the queue, a manual ingest). Idempotent per day. */
export async function recordIngestRun(env: Env, kind: IngestKind, day = budgetDay()): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO ai_budget_claims (day, kind) VALUES (?1, ?2)").bind(day, kind).run();
}

/**
 * Claims today's slot for an optional 70B job, or explains why not. `queueHasWork` comes
 * from the queue plan (see loadQueuePlan) so this module stays free of seed-file imports.
 */
export async function claimBudget(
  env: Env,
  kind: OptionalKind,
  queueHasWork: boolean,
  overrideReason?: string,
  day = budgetDay(),
): Promise<ClaimDecision> {
  const today = await claimsToday(env, day);
  const decision = decideClaim(
    kind,
    today.map((c) => c.kind),
    queueHasWork,
    overrideReason,
  );
  if (decision.allow) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO ai_budget_claims (day, kind, reason, override) VALUES (?1, ?2, ?3, ?4)",
    )
      .bind(day, kind, decision.override ? overrideReason!.trim() : null, decision.override ? 1 : 0)
      .run();
  }
  console.warn(
    JSON.stringify({
      event: "budget.claim",
      kind,
      day,
      outcome: decision.allow ? (decision.override ? "override" : "granted") : "refused",
      ...(decision.allow ? {} : { reason: decision.reason }),
      ...(decision.allow && decision.override ? { overrideReason } : {}),
    }),
  );
  return decision;
}
