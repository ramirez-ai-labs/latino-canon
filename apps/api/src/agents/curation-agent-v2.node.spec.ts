import type { CurationResponse, TitleCard, ToolCallingClient, ToolCallOptions } from "@latino-canon/core";
import { describe, expect, it } from "vitest";
import type { Env } from "../bindings.js";
import { cardLine, MAX_MODEL_CALLS, MAX_TOOL_CALLS, runAgentV2, type AgentCard, type AgentTools } from "./curation-agent-v2.js";
import { curateV2 } from "./v2-curate.js";

// Every test drives the loop with a scripted model and in-memory tools: no Workers AI, no D1.

const card = (id: string, over: Partial<TitleCard> = {}): AgentCard => ({
  card: {
    id,
    kind: "film",
    title: id,
    yearStart: 2015,
    yearEnd: null,
    director: "A Director",
    directorGender: "female",
    leadActor: null,
    leadActorGender: null,
    posterKey: null,
    blurbTeaser: null,
    inclusionTypes: [],
    inclusionTypesWithConfidence: [],
    themes: [],
    score: 0,
    representationHandling: null,
    runtime: null,
    oscarWin: null,
    genres: ["Drama"],
    contentAdvisory: "general",
    ...over,
  },
  countries: ["CO"],
  synopsis: "A story.",
});

type Call = { name: string; arguments: Record<string, unknown> };

/** A model that returns the scripted tool calls in order, one reply per model call. */
function scripted(turns: (Call[] | string)[]) {
  const seen: ToolCallOptions[] = [];
  const model: ToolCallingClient = {
    callTools(opts) {
      seen.push({ ...opts, messages: [...opts.messages] });
      const turn = turns[seen.length - 1] ?? turns[turns.length - 1]!;
      const reply = typeof turn === "string" ? { response: turn } : { tool_calls: turn };
      return Promise.resolve({ reply, usage: { inputTokens: 1500, outputTokens: 100 } });
    },
  };
  return { model, seen };
}

function fakeTools(over: Partial<AgentTools> = {}): AgentTools {
  return {
    search: () => Promise.resolve({ cards: [card("monos-2019"), card("birds-of-passage-2018")], dropped: [] }),
    getTitle: (id) => Promise.resolve(id === "monos-2019" ? card("monos-2019") : null),
    similar: () => Promise.resolve([card("embrace-of-the-serpent-2015")]),
    ...over,
  };
}

const search = (args: Record<string, unknown>): Call => ({ name: "search_titles", arguments: args });
const recommend = (...ids: string[]): Call => ({ name: "recommend", arguments: { picks: ids.map((id) => ({ id, reason: `${id} fits` })) } });

describe("runAgentV2", () => {
  it("searches with the request's constraints as filters, then recommends - labels computed, not taken from the model", async () => {
    const { model, seen } = scripted([[search({ country: "CO", decade: 2010, kind: "film" })], [recommend("monos-2019", "birds-of-passage-2018")]]);
    const out = await runAgentV2("Colombian films from the 2010s", 5, model, fakeTools());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.picks.map((p) => p.title.id)).toEqual(["monos-2019", "birds-of-passage-2018"]);
    // In the tool schema's key order (kind, decade, country), whatever order the model wrote them.
    expect(out.picks[0]!.matchedCriteria).toEqual(["type: film", "decade: 2010s", "country: CO"]);
    expect(out.picks[0]!.reason).toBe("monos-2019 fits");
    expect(out.steps).toMatchObject([{ tool: "search_titles", resultCount: 2 }]);
    // The result went back as a tool message, with the metadata the model checks constraints on.
    const toolMsg = seen[1]!.messages.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ role: "tool", name: "search_titles" });
    expect(toolMsg!.content).toContain("director: A Director (female)");
    expect(toolMsg!.content).toContain("countries: CO");
  });

  it("drops a pick no tool returned and keeps the grounded ones", async () => {
    const { model } = scripted([[search({ query: "colombia" })], [recommend("monos-2019", "invented-2020")]]);
    const out = await runAgentV2("q", 5, model, fakeTools());
    expect(out.ok && out.picks.map((p) => p.title.id)).toEqual(["monos-2019"]);
    expect(out.reasoning.join("\n")).toContain("invented-2020");
  });

  it("fails, for v1 to answer, when no pick is grounded", async () => {
    const { model } = scripted([[recommend("roma-2018")]]);
    expect(await runAgentV2("q", 5, model, fakeTools())).toMatchObject({ ok: false, reason: "no_grounded_pick" });
  });

  it("sends bad arguments back to the model as an error it can correct", async () => {
    const { model, seen } = scripted([[search({ country: "Colombia" })], [search({ country: "CO" })], [recommend("monos-2019")]]);
    const out = await runAgentV2("q", 5, model, fakeTools());
    expect(out.ok).toBe(true);
    expect(out.steps[0]!.error).toMatch(/invalid arguments/);
    expect(seen[1]!.messages.at(-1)!.content).toMatch(/^Invalid arguments - country/);
  });

  it("doesn't claim a filter the search had to drop to find anything", async () => {
    const tools = fakeTools({ search: () => Promise.resolve({ cards: [card("monos-2019")], dropped: ["country"] }) });
    const { model, seen } = scripted([[search({ country: "PY", kind: "film" })], [recommend("monos-2019")]]);
    const out = await runAgentV2("q", 5, model, tools);
    expect(out.ok && out.picks[0]!.matchedCriteria).toEqual(["type: film"]);
    expect(seen[1]!.messages.at(-1)!.content).toContain("these were dropped to find any: country");
  });

  it("stops at the model-call limit, telling the last call to recommend", async () => {
    const { model, seen } = scripted([[search({ query: "again" })]]);
    const out = await runAgentV2("q", 5, model, fakeTools());
    expect(out).toMatchObject({ ok: false, reason: "step_limit" });
    expect(seen).toHaveLength(MAX_MODEL_CALLS);
    expect(seen.at(-1)!.messages.at(-1)!.content).toMatch(/Call recommend now/);
  });

  it("runs at most MAX_TOOL_CALLS tool calls, however many the model asks for", async () => {
    const many = Array.from({ length: MAX_TOOL_CALLS + 3 }, (_, i) => search({ query: `q${i}` }));
    const { model } = scripted([many, [recommend("monos-2019")]]);
    const out = await runAgentV2("q", 5, model, fakeTools());
    expect(out.steps).toHaveLength(MAX_TOOL_CALLS);
  });

  it("fails on a reply with no tool call", async () => {
    const { model } = scripted(["Here are some films I like."]);
    expect(await runAgentV2("q", 5, model, fakeTools())).toMatchObject({ ok: false, reason: "no_tool_call" });
  });

  it("reads a call Llama wrote into its text reply, as the tool-selection eval does", async () => {
    const { model } = scripted(['<function=search_titles>{"country": "CO"}</function>', [recommend("monos-2019")]]);
    expect((await runAgentV2("q", 5, model, fakeTools())).ok).toBe(true);
  });

  it("never returns more picks than asked for, or a pick twice", async () => {
    const { model } = scripted([[search({ query: "x" })], [recommend("monos-2019", "monos-2019", "birds-of-passage-2018")]]);
    const out = await runAgentV2("q", 1, model, fakeTools());
    expect(out.ok && out.picks.map((p) => p.title.id)).toEqual(["monos-2019"]);
  });

  it("estimates the request's neurons from the token usage the model reports", async () => {
    const { model } = scripted([[search({ query: "x" })], [recommend("monos-2019")]]);
    const out = await runAgentV2("q", 5, model, fakeTools());
    // 2 calls x (1500 in, 100 out) at 26,668 / 204,805 neurons per M tokens.
    expect(out.usage).toMatchObject({ modelCalls: 2, inputTokens: 3000, outputTokens: 200, neurons: 121 });
  });
});

describe("cardLine", () => {
  it("says when a director's gender isn't on record, and trims a long synopsis", () => {
    const line = cardLine({ ...card("x", { directorGender: null }), synopsis: "s".repeat(300) });
    expect(line).toContain("(gender unknown)");
    expect(line.endsWith("...")).toBe(true);
    expect(line.length).toBeLessThan(400);
  });
});

describe("curateV2", () => {
  const env = {} as Env;
  const v1: CurationResponse = {
    userQuery: "q",
    interpretation: "v1",
    topResults: [],
    totalMatches: 0,
    reasoning: ["[1/4] v1 step"],
    extractedIntent: { cleanedQuery: "q", source: "none" },
    cached: false,
  };

  it("answers as v2 when the agent succeeds", async () => {
    const { model } = scripted([[search({ country: "CO" })], [recommend("monos-2019")]]);
    const r = await curateV2(env, { query: "q" }, () => Promise.resolve(v1), { model, tools: fakeTools() });
    expect(r).toMatchObject({ agentVersion: "v2", interpretation: "Searched: country=CO", totalMatches: 2 });
    expect(r.steps).toHaveLength(1);
  });

  // Degrade, don't fail (CLAUDE.md #8): neurons running out must not break curation.
  it("hands the request to v1 when the model call throws, keeping v2's trail", async () => {
    const model: ToolCallingClient = { callTools: () => Promise.reject(new Error("4006: daily free allocation used up")) };
    const r = await curateV2(env, { query: "q" }, () => Promise.resolve(v1), { model, tools: fakeTools() });
    expect(r.agentVersion).toBe("v1");
    expect(r.fallbackReason).toMatch(/^model_error: 4006/);
    expect(r.reasoning.at(-1)).toBe("[1/4] v1 step");
  });

  it("hands the request to v1 at the step limit", async () => {
    const { model } = scripted([[search({ query: "again" })]]);
    const r = await curateV2(env, { query: "q" }, () => Promise.resolve(v1), { model, tools: fakeTools() });
    expect(r).toMatchObject({ agentVersion: "v1", fallbackReason: "step_limit" });
    expect(r.steps!.length).toBeGreaterThan(0);
  });
});
