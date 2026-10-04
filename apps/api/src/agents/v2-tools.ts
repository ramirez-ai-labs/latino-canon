import type { TitleCard } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { hydrateCards } from "../db/cards.js";
import { runSearch } from "../search/run-search.js";
import { similarTitleHits } from "../search/similar.js";
import type { AgentCard, AgentTools } from "./curation-agent-v2.js";

/**
 * The v2 agent's tools on D1 and Vectorize, in-process - the same code /search,
 * /titles/:id and /titles/:id/similar run, so every result passes the canon's visibility
 * gate (hydrateCards). Search takes the model's filters as **explicit** filters with no query
 * rewrite: the model already chose them, and a rewrite underneath would pay for a second LLM
 * call and could add guessed filters back (#215).
 */
export function makeAgentTools(env: Env): AgentTools {
  return {
    async search({ query, filters, limit }) {
      const { hits, dropped } = await runSearch(env, { query: query ?? "", mode: "hybrid", explicit: filters, inferred: {}, limit, offset: 0 });
      return { cards: await withDetails(env, await hydrateCards(env, hits)), dropped };
    },
    async getTitle(id) {
      const [card] = await hydrateCards(env, [{ titleId: id, score: 0 }]);
      return card ? ((await withDetails(env, [card]))[0] ?? null) : null;
    },
    async similar(id, limit) {
      const cards = (await hydrateCards(env, await similarTitleHits(env, id, limit))).slice(0, limit);
      return withDetails(env, cards);
    },
  };
}

/**
 * Production countries and the synopsis, which a card doesn't carry and the model needs: a
 * country the request names but no filter was used for, and what a title is about. One
 * query per tool call (at most 12 ids, well inside D1's 100-bound-param cap).
 */
async function withDetails(env: Env, cards: TitleCard[]): Promise<AgentCard[]> {
  if (cards.length === 0) return [];
  const placeholders = cards.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await env.DB.prepare(`SELECT id, countries, synopsis FROM titles WHERE id IN (${placeholders})`)
    .bind(...cards.map((c) => c.id))
    .all<{ id: string; countries: string | null; synopsis: string | null }>();
  const byId = new Map(results.map((r) => [r.id, r]));
  return cards.map((card) => {
    const row = byId.get(card.id);
    return { card, countries: parseCountries(row?.countries ?? null), synopsis: row?.synopsis ?? null };
  });
}

function parseCountries(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
