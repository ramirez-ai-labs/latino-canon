import "server-only";
import type { Collection, EvalRun, SearchResponse, Title } from "@latino-canon/core";
import { localCollection, localCollections, localSearch, localTitle } from "./local-data";

/**
 * Server-side API client. Prefers the `API` service binding (no network hop); falls
 * back to PUBLIC_API_URL when running `next dev` without bindings.
 */
async function apiFetch<T>(path: string): Promise<T> {
  if (process.env.LOCAL_DEV === "1") return localFetch<T>(path);

  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const api = (env as { API?: { fetch: typeof fetch } }).API;
  const url = `https://api${path}`;

  const res = api
    ? await api.fetch(new Request(url))
    : await fetch(`${process.env.PUBLIC_API_URL ?? "http://localhost:8787"}${path}`);

  if (!res.ok) throw new Error(`api ${res.status} for ${path}`);
  return (await res.json()) as T;
}

function localFetch<T>(path: string): T {
  const url = new URL(path, "http://localhost");
  if (url.pathname === "/collections") return localCollections() as T;
  if (url.pathname.startsWith("/collections/")) return localCollection(url.pathname.slice("/collections/".length)) as T;
  if (url.pathname.startsWith("/titles/")) return localTitle(url.pathname.slice("/titles/".length)) as T;
  // eval_runs is CI-written only (see apps/api/src/routes/eval-runs.ts) - nothing
  // to show against local mock data, so LOCAL_DEV just renders an empty history.
  if (url.pathname === "/eval-runs") return { runs: [] } as T;
  return localSearch({
    q: url.searchParams.get("q") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
    theme: url.searchParams.get("theme") ?? undefined,
    decade: url.searchParams.get("decade") ? Number(url.searchParams.get("decade")) : undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  }) as T;
}

export function search(params: {
  q?: string;
  mode?: string;
  theme?: string;
  decade?: number;
  kind?: string;
  country?: string;
  inclusionType?: string;
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
  return apiFetch<SearchResponse>(`/search?${qs}`);
}

export const getTitle = (id: string) => apiFetch<Title>(`/titles/${id}`);
export const listCollections = () => apiFetch<{ collections: Collection[] }>(`/collections`);
export const getCollection = (slug: string) => apiFetch<Collection>(`/collections/${slug}`);
export const listEvalRuns = (limit = 20) => apiFetch<{ runs: EvalRun[] }>(`/eval-runs?limit=${limit}`);

export async function listRecentTitles(limit = 5): Promise<Title[]> {
  const res = await apiFetch<{ titleIds: string[] }>(`/titles?recent=1&limit=${limit}`);
  const titles = await Promise.all(
    res.titleIds.map((id) => getTitle(id).catch(() => null))
  );
  return titles.filter((t): t is Title => t !== null);
}

export function posterUrl(key: string | null): string {
  if (!key) return "/poster-placeholder.svg";
  return `${process.env.PUBLIC_API_URL ?? ""}/posters/${key.replace(/^posters\//, "")}`;
}
