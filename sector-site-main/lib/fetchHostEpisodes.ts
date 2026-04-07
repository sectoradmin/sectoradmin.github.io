/* lib/fetchHostEpisodes.ts
   Thin adapter over your already-preloaded Mixcloud shows +
   smart Kirby slug resolver for /shows/[slug] navigation.
*/

export type HostEpisode = {
  title: string;
  slug: string;                 // stable key (tail of Mixcloud key/url)
  host: string;                 // display name we searched for
  showlink: string | null;      // Mixcloud URL (footer widget)
  imageUrl: string | null;      // Mixcloud art
  tags?: Array<{ name: string }>;
  created_time?: string;
};

export type MixcloudShow = {
  key: string;                  // e.g. "/sectorfm/host-ep-.../"
  url: string;                  // https://www.mixcloud.com/sectorfm/...
  name: string;                 // episode title
  tags?: Array<{ name: string }>;
  created_time?: string;
  pictures?: { large?: string; medium?: string; thumbnail?: string };
};

type Options = {
  force?: boolean;                     // bypass per-resident cache
  sourceShows?: MixcloudShow[];        // (optional) pass shows directly
};

const KIRBY_API = "https://sector.fm/api/query";

/* ----------------------- caches ----------------------- */
const RESIDENT_CACHE = new Map<string, HostEpisode[]>();      // canon(resident) -> episodes
const MIX2KIRBY_SLUG = new Map<string, string | null>();      // mixcloud url -> kirby slug|null
let SHOWS_CACHE: MixcloudShow[] | null = null;                // memoized source

/* ----------------------- utils ------------------------ */
const asciiFold = (s: string) =>
  (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘‚‛‹›“”„‟«»]/g, "'");

const canon = (s: string) => asciiFold(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

const lastPathPiece = (p: string) => {
  try {
    const u = new URL(p);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || p;
  } catch {
    const parts = p.split("/").filter(Boolean);
    return parts[parts.length - 1] || p;
  }
};

const pickImage = (pictures?: any) =>
  pictures?.large || pictures?.medium || pictures?.thumbnail || null;

function extractTopicAfterColon(title: string): string | null {
  if (!title) return null;
  const i = title.lastIndexOf(":");
  if (i === -1) return null;
  return title.slice(i + 1).trim();
}

function parseTitleTailToTs(title: string): number {
  const seps = [" - ", " – ", " — "];
  let idx = -1;
  for (const s of seps) {
    const i = title.lastIndexOf(s);
    if (i > idx) idx = i;
  }
  if (idx === -1) return 0;
  const raw = title.slice(idx + 3).trim().replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1");
  const m = raw.match(/^(\d{1,2})\s+([A-Za-z]+),\s*(\d{4})/);
  if (!m) return 0;
  const day = +m[1];
  const monthName = m[2].toLowerCase();
  const year = +m[3];
  const months: Record<string, number> = {
    january:0,february:1,march:2,april:3,may:4,june:5,
    july:6,august:7,september:8,october:9,november:10,december:11
  };
  if (!(monthName in months)) return 0;
  return new Date(year, months[monthName], day).getTime() || 0;
}

/* --------- source: injected -> global -> cached route --------- */
export function setMixcloudSource(list: MixcloudShow[]) {
  SHOWS_CACHE = Array.isArray(list) ? list.slice() : [];
}

async function getMixcloudSource(opts?: Options): Promise<MixcloudShow[]> {
  if (Array.isArray(opts?.sourceShows) && opts!.sourceShows!.length) {
    return opts!.sourceShows!;
  }
  if (SHOWS_CACHE && SHOWS_CACHE.length) return SHOWS_CACHE;

  if (typeof window !== "undefined") {
    const w: any = window as any;
    const globalShows =
      (Array.isArray(w.__SECTOR_ALL_SHOWS__) && w.__SECTOR_ALL_SHOWS__) ||
      (Array.isArray(w.__MIXCLOUD_ALL_SHOWS__) && w.__MIXCLOUD_ALL_SHOWS__) ||
      null;
    if (globalShows && globalShows.length) {
      SHOWS_CACHE = globalShows as MixcloudShow[];
      return SHOWS_CACHE;
    }
  }

  // Fallback to your own cache routes (mirrors main-app)
  try {
    const r = await fetch("/api/shows-cache", { cache: "force-cache" });
    if (r.ok) {
      const j = await r.json();
      const data = Array.isArray(j?.data) ? (j.data as MixcloudShow[]) : [];
      SHOWS_CACHE = data;
      if (SHOWS_CACHE.length) return SHOWS_CACHE;
    }
  } catch { /* noop */ }

  try {
    const r = await fetch("/api/shows-quick", { cache: "force-cache" });
    if (r.ok) {
      const j = await r.json();
      const data = Array.isArray(j?.data) ? (j.data as MixcloudShow[]) : [];
      SHOWS_CACHE = data;
      if (SHOWS_CACHE.length) return SHOWS_CACHE;
    }
  } catch { /* noop */ }

  return [];
}

/* ------------------ Kirby slug resolver ------------------ */
function escKql(str: string) {
  return String(str).replace(/'/g, "\\'");
}

async function kql<T = any>(query: string): Promise<T | null> {
  const url = `${KIRBY_API}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return (j && j.result) ?? null;
}

/** Most reliable: find show by Mixcloud link stored in Kirby */
export async function resolveKirbySlugForMixcloud(mixUrl: string): Promise<string | null> {
  if (!mixUrl) return null;
  if (MIX2KIRBY_SLUG.has(mixUrl)) return MIX2KIRBY_SLUG.get(mixUrl)!;

  const q = `page('shows').children.filterBy('showlink','*=','${escKql(mixUrl)}').pluck('slug')`;
  const arr = (await kql<string[]>(q)) || [];
  const slug = Array.isArray(arr) && arr[0] ? String(arr[0]) : null;

  MIX2KIRBY_SLUG.set(mixUrl, slug);
  return slug;
}

/** Quick check: does a Kirby show with this slug exist? */
async function slugExistsInKirby(slug: string): Promise<boolean> {
  if (!slug) return false;
  const q = `page('shows').children.filterBy('slug','==','${escKql(slug)}').count`;
  const count = await kql<number>(q);
  return !!count;
}

/** Build a Kirby-like slug straight from the Mixcloud title */
export function slugifyTitleForKirby(title: string): string {
  // Lowercase, remove commas, replace en/em dashes with space, collapse non-alnum to hyphen
  return asciiFold(title)
    .toLowerCase()
    .replace(/[,/]/g, " ")
    .replace(/[–—]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Fuzzy: try to find a show whose slug *contains* a candidate segment */
async function findSlugByContains(candidate: string): Promise<string | null> {
  const q = `page('shows').children.filterBy('slug','*=','${escKql(candidate)}').pluck('slug')`;
  const arr = (await kql<string[]>(q)) || [];
  return Array.isArray(arr) && arr[0] ? String(arr[0]) : null;
}

/** Smart resolver used by the UI when clicking an episode card */
export async function resolveKirbySlugSmart(ep: {
  slug?: string | null;
  title?: string | null;
  showlink?: string | null;
}): Promise<string | null> {
  // 1) Exact by stored Mixcloud link (most reliable)
  if (ep.showlink) {
    const byLink = await resolveKirbySlugForMixcloud(ep.showlink);
    if (byLink) return byLink;
  }

  // 2) Try Mixcloud tail as-is (often identical in your data)
  const tail = (ep.slug || "").trim();
  if (tail && await slugExistsInKirby(tail)) return tail;

  // 3) Try a slug from the title
  const guess = ep.title ? slugifyTitleForKirby(ep.title) : "";
  if (guess && await slugExistsInKirby(guess)) return guess;

  // 4) Fuzzy contains on slug/title candidates
  if (tail) {
    const byContainsTail = await findSlugByContains(tail);
    if (byContainsTail) return byContainsTail;
  }
  if (guess) {
    const byContainsGuess = await findSlugByContains(guess);
    if (byContainsGuess) return byContainsGuess;
  }

  // 5) Give up
  return null;
}

/* ------------------ main entry: resident episodes ------------------ */
export async function fetchHostEpisodes(hostName: string, opts?: Options): Promise<HostEpisode[]> {
  const key = canon(hostName);
  if (!opts?.force && RESIDENT_CACHE.has(key)) {
    return RESIDENT_CACHE.get(key)!.slice();
  }

  const source = await getMixcloudSource(opts);
  const q = canon(hostName);
  const seps = [" - ", " – ", " — "];

  const out: HostEpisode[] = [];

  for (const it of source) {
    const name = it?.name || "";
    const url = it?.url || "";
    const keyPiece = lastPathPiece(it?.key || it?.url || "");
    const tags = Array.isArray(it?.tags)
      ? it.tags.filter(Boolean).map((t: any) => ({ name: String(t?.name || "").trim() })).filter(t => t.name)
      : [];
    const created_time: string | undefined = it?.created_time || undefined;

    const nameC = canon(name);
    if (!nameC) continue;

    // 1) full title contains resident (accent/punct-insensitive)
    let match = nameC.includes(q);

    // 2) pre-dash equals resident (e.g., "Host - 14th September, 2025")
    if (!match) {
      let idx = -1;
      for (const s of seps) {
        const i = name.indexOf(s);
        if (i !== -1) { idx = i; break; }
      }
      if (idx !== -1) {
        const pre = name.slice(0, idx).trim();
        if (canon(pre) === q) match = true;
      }
    }

    // 3) post-colon topic contains resident (e.g., "…: June Morning", "…: They Hate Change")
    if (!match) {
      const topic = extractTopicAfterColon(name);
      if (topic && canon(topic).includes(q)) match = true;
    }

    if (!match) continue;

    out.push({
      title: name,
      slug: keyPiece,
      host: hostName,
      showlink: url || null,
      imageUrl: pickImage(it?.pictures),
      tags,
      created_time,
    });
  }

  // Newest first: created_time if present, else fallback to title-tail date
  out.sort((a, b) => {
    const at = Date.parse(a.created_time || "");
    const bt = Date.parse(b.created_time || "");
    if (!isNaN(at) && !isNaN(bt)) return bt - at;
    return parseTitleTailToTs(b.title) - parseTitleTailToTs(a.title);
  });

  RESIDENT_CACHE.set(key, out.slice());
  return out;
}
