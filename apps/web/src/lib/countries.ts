import { CANON_COUNTRIES } from "@latino-canon/core";

/**
 * A title's production countries as readers can read them. The title page used to print
 * TMDB's ISO codes ("CL, NO, VE"), which mean nothing to most readers, and listed a
 * financing co-producer (Norway, on The Family) on equal footing with the film's own
 * countries - next to a "Latino-directed" tag it read like a claim about the film.
 *
 * Countries in the canon's scope (CANON_COUNTRIES) come first; the rest are named as
 * co-producers, since production country records who put money in, not heritage
 * (CRITERIA.md, Data notes). Kept in the web app, not packages/core, so a display fix
 * doesn't redeploy every Worker - the naming matches core's countryOptions (Intl, English,
 * the code itself when Intl can't name it).
 */
export function formatCountries(codes: string[], locale = "en"): { primary: string; coProducers: string } {
  const name = regionNamer(locale);
  const inScope = new Set(CANON_COUNTRIES);
  const own = codes.filter((c) => inScope.has(c)).map(name);
  const others = codes.filter((c) => !inScope.has(c)).map(name);
  // A title with no in-scope country (rare: a US-financed film TMDB credits only abroad)
  // shows its countries plainly rather than an empty line plus "co-produced with".
  return own.length > 0
    ? { primary: own.join(", "), coProducers: others.join(", ") }
    : { primary: others.join(", "), coProducers: "" };
}

function regionNamer(locale: string) {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  return (code: string): string => {
    try {
      return names?.of(code) ?? code;
    } catch {
      return code;
    }
  };
}
