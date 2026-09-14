export interface SeedTitle {
  ref: string;
  title: string;
  year: number;
  kind: "film" | "series" | "special";
  seedInclusionTypes?: string[];
}

const BATCH = 4; // keep Workers AI neurons/day in budget; the nightly cron mops up the rest

/** POST titles to the deployed ingest worker's /ingest endpoint, a few at a time. */
export async function postTitlesInBatches(url: string, token: string, titles: SeedTitle[]): Promise<void> {
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const res = await fetch(`${url}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ titles: chunk }),
    });
    const text = await res.text();
    console.log(`batch ${i / BATCH + 1}:`, res.status, text);
    if (!res.ok) throw new Error(`ingest request failed: ${res.status} ${text}`);
    if (i + BATCH < titles.length) await new Promise((r) => setTimeout(r, 5000));
  }
}
