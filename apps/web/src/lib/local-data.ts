import type { Collection, SearchResponse, Title, TitleCard } from "@latino-canon/core";

const titles: Title[] = [
  title("mi-familia-1995", "Mi Familia", 1995, "film", "Gregory Nava", ["family", "identity"], "A multigenerational Mexican American family story."),
  title("selena-1997", "Selena", 1997, "film", "Gregory Nava", ["music", "identity"], "A landmark Tejano music biopic with enduring cultural reach."),
  title("real-women-have-curves-2002", "Real Women Have Curves", 2002, "film", "Patricia Cardoso", ["family", "coming_of_age"], "A warm, candid coming-of-age story centered on a Mexican American family."),
  title("one-day-at-a-time-2017", "One Day at a Time", 2017, "series", "Gloria Calderon Kellett", ["family", "identity"], "A Cuban American family sitcom with an unusually direct voice on contemporary issues."),
  title("coco-2017", "Coco", 2017, "film", "Lee Unkrich", ["family", "music"], "A globally visible animated story about Mexican family, memory, and music."),
  title("vida-2018", "Vida", 2018, "series", "Tanya Saracho", ["identity", "queer_latino", "community" as never], "A portrait of Mexican American sisters and a changing Los Angeles neighborhood."),
  title("gentefied-2020", "Gentefied", 2020, "series", "Marvin Lemus", ["community" as never, "family", "class"], "A bilingual, multigenerational series about belonging and change in Boyle Heights."),
];

const collections: Collection[] = [
  collection("core-canon", "Core Canon", "Essential works for an evolving Latino screen canon."),
  collection("border-stories", "Border Stories", "Migration, belonging, and borderlands narratives."),
  collection("latina-directors", "Directors", "Films and series shaped by Latino and Latina filmmakers."),
  collection("breakthrough-firsts", "Breakthrough Firsts", "Projects that opened new space in U.S. screen culture."),
];

export function localSearch(params: {
  q?: string;
  kind?: string;
  theme?: string;
  decade?: number;
  limit?: number;
  offset?: number;
}): SearchResponse {
  const started = Date.now();
  const query = params.q?.trim().toLowerCase() ?? "";
  const offset = params.offset ?? 0;
  const results = titles
    .filter((item) => {
      const text = [item.title, item.synopsis, ...item.tags.map((tag) => tag.slug)].join(" ").toLowerCase();
      return (!query || text.includes(query))
        && (!params.kind || item.kind === params.kind)
        && (!params.theme || item.tags.some((tag) => tag.slug === params.theme))
        && (!params.decade || item.yearStart >= params.decade && item.yearStart < params.decade + 10);
    })
    .slice(offset, offset + (params.limit ?? 36))
    .map(toCard);

  return { query: params.q ?? "", mode: "lexical", interpretation: null, results, tookMs: Date.now() - started };
}

export function localTitle(id: string): Title | null {
  return titles.find((item) => item.id === id) ?? null;
}

export function localCollections(): { collections: Collection[] } {
  return { collections: collections.map((item) => ({ ...item, items: titles.slice(0, 3).map(toCard) })) };
}

export function localCollection(slug: string): Collection | null {
  const found = collections.find((item) => item.slug === slug);
  return found ? { ...found, items: titles.slice(0, 3).map(toCard) } : null;
}

function title(id: string, name: string, year: number, kind: Title["kind"], director: string, themes: string[], blurb: string): Title {
  return {
    id, title: name, tmdbId: null, imdbId: null, kind, originalTitle: null, yearStart: year, yearEnd: null,
    country: ["US"], language: ["en"], synopsis: blurb, posterKey: null, popularity: 1, runtime: null,
    credits: [{ person: { id: director.toLowerCase().replaceAll(" ", "-"), tmdbId: null, name: director, knownForDepartment: "Directing", gender: null }, role: "director", character: null, order: 0 }],
    tags: themes.map((theme) => ({ kind: "theme", slug: theme as never, label: theme.replaceAll("_", " "), confidence: 1, source: "seed" })),
    blurb: { text: blurb, sources: [{ kind: "synopsis", ref: id, quote: blurb }], model: "local-seed", approved: true },
    representationHandling: null, contextNotes: [], oscarWin: null,
    genres: [], contentAdvisory: null,
  };
}

function toCard(item: Title): TitleCard {
  return {
    id: item.id, kind: item.kind, title: item.title, yearStart: item.yearStart, yearEnd: item.yearEnd,
    director: item.credits.find((credit) => credit.role === "director")?.person.name ?? null,
    directorGender: item.credits.find((credit) => credit.role === "director")?.person.gender ?? null,
    leadActor: item.credits
      .filter((credit) => credit.role === "cast")
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))[0]?.person.name ?? null,
    leadActorGender: item.credits
      .filter((credit) => credit.role === "cast")
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))[0]?.person.gender ?? null,
    posterKey: null, blurbTeaser: item.blurb?.text ?? null, inclusionTypes: [],
    inclusionTypesWithConfidence: [],
    themes: item.tags.filter((tag) => tag.kind === "theme").map((tag) => tag.slug as never), score: item.popularity,
    representationHandling: item.representationHandling, runtime: item.runtime, oscarWin: item.oscarWin,
    genres: item.genres, contentAdvisory: item.contentAdvisory,
  };
}

function collection(slug: string, title: string, description: string): Collection {
  return { id: slug, slug, title, description, kind: "curated", items: [] };
}