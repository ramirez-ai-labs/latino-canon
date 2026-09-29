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
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Countries labeled with their English names and sorted A-Z by that name, not by code
 * ("Spain" is ES but sorts after "Peru"). A code Intl can't name keeps the code as its label.
 */
export function countryOptions(countries: CatalogFacets["countries"], locale = "en"): FacetOption[] {
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
  return countries
    .map((c) => ({ value: c.code, label: label(c.code), count: c.count }))
    .sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: "base" }));
}

/** Decades oldest first, labeled "1930s". */
export function decadeOptions(decades: CatalogFacets["decades"]): FacetOption[] {
  return [...decades]
    .sort((a, b) => a.decade - b.decade)
    .map((d) => ({ value: String(d.decade), label: `${d.decade}s`, count: d.count }));
}
