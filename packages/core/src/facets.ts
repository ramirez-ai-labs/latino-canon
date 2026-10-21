/**
 * Filter options built from what the catalog actually holds (GET /titles/facets), not a
 * hand-kept list. The web's country and decade dropdowns were hard-coded before the Latin
 * American expansion: 35 canon titles from Bolivia, Costa Rica, Ecuador, Honduras,
 * Nicaragua, Panama and Paraguay couldn't be filtered, nor anything before 1980 (Limite,
 * Los olvidados, Araya, Lucía). Deriving the options keeps them in step with every
 * title the ingest queue adds.
 */

export interface CatalogFacets {
  /** ISO 3166-1 alpha-2 production countries, with how many canon titles list each. */
  countries: { code: string; count: number }[];
  /** Decade starts (1930, 1940, ...), with how many canon titles began in each. */
  decades: { decade: number; count: number }[];
  /** Release years, with how many canon titles began in each. */
  years: { year: number; count: number }[];
}

/**
 * The countries the canon is about: the United States, Spain and Latin America - the scope
 * apps/ingest/src/seed/CRITERIA.md sets ("Latino" as Hispanic broadly, plus Brazil; Haiti
 * decided out of scope). TMDB lists every co-producing country, so the raw facets also
 * hold France, Qatar, Hong Kong and others that co-financed a single film; the country
 * filter offers only these. A title is never hidden by this - a Mexican-French
 * co-production is still under Mexico - and the api still returns every country.
 */
export const CANON_COUNTRIES: readonly string[] = [
  "US", "ES",
  "AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "SV",
  "GT", "HN", "MX", "NI", "PA", "PY", "PE", "PR", "UY", "VE",
];

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/**
 * The in-scope countries (CANON_COUNTRIES) the catalog has titles from, labeled with their
 * English names and sorted A-Z by that name, not by code ("Spain" is ES but sorts after
 * "Peru"). A code Intl can't name keeps the code as its label.
 */
export function countryOptions(
  countries: CatalogFacets["countries"],
  locale = "en",
  scope: readonly string[] = CANON_COUNTRIES,
): FacetOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  const label = (code: string): string => {
    try {
      return names?.of(code) ?? code;
    } catch {
      return code;
    }
  };
  const inScope = new Set(scope);
  return countries
    .filter((c) => inScope.has(c.code))
    .map((c) => ({ value: c.code, label: label(c.code), count: c.count }))
    .sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: "base" }));
}

/** Decades oldest first, labeled "1930s". */
export function decadeOptions(decades: CatalogFacets["decades"]): FacetOption[] {
  return [...decades]
    .sort((a, b) => a.decade - b.decade)
    .map((d) => ({ value: String(d.decade), label: `${d.decade}s`, count: d.count }));
}

/**
 * A year with at least this many titles gets its own "Released" option instead of
 * sharing its decade's. Found live (2026-10-20): "2020s" matched 152 of 460 titles, 95
 * of them from 2025-26 alone after the festival-circuit batch (#339).
 */
export const RELEASE_YEAR_SPLIT = 25;

/**
 * Options for the "Released" filter, newest first. Each value is "from-to" (inclusive),
 * the api's yearFrom/yearTo. A decade is one option ("2010s") unless its newest years
 * each hold RELEASE_YEAR_SPLIT+ titles: those become single-year options and the rest of
 * the decade one range ("2026", "2025", "2020-2024"). Only a run of busy years at the
 * newest end splits off, so every range stays contiguous - a busy 2017 stays in "2010s"
 * rather than leaving a "2010s except 2017" no range can express.
 */
export function releaseOptions(
  years: CatalogFacets["years"],
  splitAt: number = RELEASE_YEAR_SPLIT,
): FacetOption[] {
  const byDecade = new Map<number, Map<number, number>>();
  for (const { year, count } of years) {
    const decade = Math.floor(year / 10) * 10;
    const counts = byDecade.get(decade) ?? new Map<number, number>();
    counts.set(year, (counts.get(year) ?? 0) + count);
    byDecade.set(decade, counts);
  }
  const options: FacetOption[] = [];
  for (const decade of [...byDecade.keys()].sort((a, b) => b - a)) {
    const counts = byDecade.get(decade)!;
    const desc = [...counts.keys()].sort((a, b) => b - a);
    let i = 0;
    while (i < desc.length && counts.get(desc[i]!)! >= splitAt) {
      const year = desc[i]!;
      options.push({ value: `${year}-${year}`, label: String(year), count: counts.get(year)! });
      i++;
    }
    if (i === desc.length) continue;
    const rest = desc.slice(i);
    const count = rest.reduce((n, y) => n + counts.get(y)!, 0);
    const to = i === 0 ? decade + 9 : desc[i - 1]! - 1;
    options.push({
      value: `${decade}-${to}`,
      label: to === decade + 9 ? `${decade}s` : `${decade}\u2013${to}`,
      count,
    });
  }
  return options;
}

/** "2020-2024" -> { yearFrom: 2020, yearTo: 2024 }; anything else -> null. */
export function parseReleaseRange(value: string | null | undefined): { yearFrom: number; yearTo: number } | null {
  const m = /^(\d{4})-(\d{4})$/.exec(value ?? "");
  if (!m) return null;
  const yearFrom = Number(m[1]);
  const yearTo = Number(m[2]);
  return yearFrom <= yearTo ? { yearFrom, yearTo } : null;
}
