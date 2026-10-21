import "server-only";
import {
  countryOptions,
  releaseOptions,
  type BlurbGateDay,
  type CatalogFacets,
  type Collection,
  type CurationResponse,
  type EvalRun,
  type FacetOption,
  type SearchResponse,
  type Title,
  type TitleCard,
} from "@latino-canon/core";
import { localCollection, localCollections, localSearch, localTitle } from "./local-data";

/**
 * A non-2xx api response. Pages branch on `status`: a 404 title is notFound(), a 429 is
 * "slow down" shown in place - not the generic error page, whose message Next strips in
 * production.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`api ${status} for ${path}`);
    this.name = "ApiError";
  }
}

/**
 * Server-side API client. Prefers the `API` service binding (no network hop); falls
 * back to PUBLIC_API_URL when running `next dev` without bindings.
 */
async function apiFetch<T>(
  path: string,
  options?: { method?: string; body?: string },
): Promise<T> {
  if (process.env.LOCAL_DEV === "1") return localFetch<T>(path);

  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const api = (env as { API?: { fetch: typeof fetch } }).API;
  const url = `https://api${path}`;

  // The api rate-limits per viewer, but over the service binding it only sees this
  // worker - pass the viewer's address along (every page here is force-dynamic, so
  // reading request headers is always allowed).
  const { headers } = await import("next/headers");
  const viewerIp = (await headers()).get("cf-connecting-ip");

  const fetchOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(viewerIp ? { "x-client-ip": viewerIp } : {}),
    },
  };

  const res = api
    ? await api.fetch(new Request(url, fetchOptions))
    : await fetch(`${process.env.PUBLIC_API_URL ?? "http://localhost:8787"}${path}`, fetchOptions);

  if (!res.ok) throw new ApiError(res.status, path);
  return (await res.json()) as T;
}

function localFetch<T>(path: string): T {
  const url = new URL(path, "http://localhost");
  if (url.pathname === "/collections") return localCollections() as T;
  if (url.pathname.startsWith("/collections/")) return localCollection(url.pathname.slice("/collections/".length)) as T;
  // Mock data has no vectors - the title page falls back to its theme-based list.
  if (url.pathname.endsWith("/similar")) return { titleId: "", results: [] } as T;
  if (url.pathname === "/titles/facets") return { countries: [], decades: [], years: [] } as T;
  if (url.pathname.startsWith("/titles/")) return localTitle(url.pathname.slice("/titles/".length)) as T;
  // eval_runs is CI-written only (see apps/api/src/routes/eval-runs.ts) - nothing
  // to show against local mock data, so LOCAL_DEV just renders an empty history.
  if (url.pathname === "/eval-runs") return { runs: [] } as T;
  if (url.pathname === "/eval-runs/blurb-gate") return { days: [] } as T;
  return localSearch({
    q: url.searchParams.get("q") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
    theme: url.searchParams.get("theme") ?? undefined,
    decade: url.searchParams.get("decade") ? Number(url.searchParams.get("decade")) : undefined,
    yearFrom: url.searchParams.get("yearFrom") ? Number(url.searchParams.get("yearFrom")) : undefined,
    yearTo: url.searchParams.get("yearTo") ? Number(url.searchParams.get("yearTo")) : undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  }) as T;
}

export function search(params: {
  q?: string;
  mode?: string;
  theme?: string;
  decade?: number;
  yearFrom?: number;
  yearTo?: number;
  kind?: string;
  country?: string;
  inclusionType?: string;
  genre?: string;
  contentAdvisory?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
  return apiFetch<SearchResponse>(`/search?${qs}`);
}

/** The site's browse order: newest to the canon first, stable between visits (see BrowseSort). */
export const DEFAULT_SORT = "added";

/**
 * The filters and browse order a /search or /catalog URL carries, as search() params.
 * sort is sent only for a browse (no q) - a query ranks by relevance.
 */
export function searchParamsFromUrl(sp: Record<string, string | undefined>) {
  const num = (v: string | undefined) => (v ? Number(v) : undefined);
  return {
    theme: sp.theme,
    kind: sp.kind,
    country: sp.country,
    decade: num(sp.decade),
    yearFrom: num(sp.yearFrom),
    yearTo: num(sp.yearTo),
    inclusionType: sp.inclusionType,
    sort: sp.q ? undefined : (sp.sort ?? DEFAULT_SORT),
  };
}

export function curateSearch(params: { q: string; limit?: number }): Promise<CurationResponse> {
  return apiFetch<CurationResponse>(`/agents/curate`, {
    method: "POST",
    body: JSON.stringify({ query: params.q, limit: params.limit }),
  });
}

export const getTitle = (id: string) => apiFetch<Title>(`/titles/${id}`);

/**
 * Country and release-year options for the search filters, from what the catalog holds. A
 * failed call degrades to empty lists - the filters still work from the URL, and a page
 * never fails because its dropdowns couldn't load.
 */
export async function getFilterOptions(): Promise<{ countries: FacetOption[]; released: FacetOption[] }> {
  try {
    const facets = await apiFetch<CatalogFacets>(`/titles/facets`);
    // `years` is new in this release - an api that predates it degrades to no options.
    return { countries: countryOptions(facets.countries), released: releaseOptions(facets.years ?? []) };
  } catch (err) {
    console.warn(JSON.stringify({ event: "web.facets_failed", error: err instanceof Error ? err.message : String(err) }));
    return { countries: [], released: [] };
  }
}
export const getSimilarTitles = (id: string, limit = 8) =>
  apiFetch<{ titleId: string; results: TitleCard[] }>(`/titles/${id}/similar?limit=${limit}`);
export const listCollections = () => apiFetch<{ collections: Collection[] }>(`/collections`);
export const getCollection = (slug: string) => apiFetch<Collection>(`/collections/${slug}`);
export const getBlurbGateDaily = (days = 14) => apiFetch<{ days: BlurbGateDay[] }>(`/eval-runs/blurb-gate?days=${days}`);
export const listEvalRuns = (limit = 20, type?: EvalRun["evalType"]) =>
  apiFetch<{ runs: EvalRun[] }>(`/eval-runs?limit=${limit}${type ? `&type=${type}` : ""}`);

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
