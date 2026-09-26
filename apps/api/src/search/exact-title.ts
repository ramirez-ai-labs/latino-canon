import type { Env } from "../bindings.js";
import { visibilityGateSql } from "./filters.js";

/** Case, accents and punctuation don't make a different title: "Y Tu Mamá También" = "y tu mama tambien". */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "gloria 2013" -> { name: "gloria", year: 2013 }, so a year can pick between namesakes. */
function splitTrailingYear(norm: string): { name: string; year: number } | null {
  const m = /^(.*\S)\s+((?:18|19|20)\d{2})$/.exec(norm);
  return m ? { name: m[1]!, year: Number(m[2]) } : null;
}

/**
 * Titles whose display title, original title or alias IS the query - the whole string,
 * not a word in it. Ranked first by the caller, ahead of BM25 + vector fusion, because a
 * search for a film's exact name should never show another film first. Found by the
 * retrieval eval: "y tu mama tambien" ranked the film #2, then #3 as the catalog grew
 * (docs/ROADMAP.md, bilingual search). A trailing year narrows namesakes ("gloria 2013").
 *
 * FTS5 (unicode61, remove_diacritics) narrows to rows containing the phrase in a name
 * column; the equality check below throws out "Coco Chanel" for "coco". Same visibility
 * gate as lexicalSearch, so it can't surface a title search wouldn't show.
 */
export async function exactTitleIds(env: Env, query: string): Promise<string[]> {
  const norm = normalizeTitle(query);
  if (norm.length < 2) return [];
  const withYear = splitTrailingYear(norm);
  // The shorter phrase (name without a trailing year) also matches titles that contain
  // the year ("Blade Runner 2049"), which the full-string check below still accepts.
  const phrase = withYear?.name ?? norm;
  const gate = visibilityGateSql("t", 1);

  const { results } = await env.DB.prepare(
    `SELECT t.id, t.title, t.original_title, t.year_start, t.popularity,
       (SELECT group_concat(a.alias, char(31)) FROM title_aliases a WHERE a.title_id = t.id) AS aliases
     FROM titles_fts
     JOIN titles t ON t.rowid = titles_fts.rowid
     WHERE titles_fts MATCH ?1 AND ${gate.clause}
     LIMIT 25`,
  )
    .bind(`{title original_title aliases} : "${phrase}"`, ...gate.params)
    .all<{
      id: string;
      title: string;
      original_title: string | null;
      year_start: number;
      popularity: number | null;
      aliases: string | null;
    }>();

  return results
    .filter((r) => {
      const names = [r.title, r.original_title, ...(r.aliases?.split("\u001f") ?? [])]
        .filter((n): n is string => Boolean(n))
        .map(normalizeTitle);
      return names.includes(norm) || (withYear !== null && names.includes(withYear.name) && r.year_start === withYear.year);
    })
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((r) => r.id);
}
