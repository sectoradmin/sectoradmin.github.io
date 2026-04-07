// app/shows/[slug]/page.tsx
import { Suspense } from "react";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/* ====================== Types ====================== */
type KirbyShowPage = {
  children: any[];
  content?: {
    title?: string;
    host?: string;
    showlink?: string;
    tracklist?: string;
  };
  files?: string[];
  slug?: string;
  title?: string;
  uid?: string;
  url?: string;
};

type MixcloudTag = { name?: string };
type MixcloudPictures = { large?: string; medium?: string; thumbnail?: string };

type MixcloudShow = {
  key?: string;             // e.g. "/sectorfm/host-ep-.../"
  url?: string;             // https://www.mixcloud.com/sectorfm/host-ep-.../
  name?: string;            // episode title
  tags?: MixcloudTag[];
  pictures?: MixcloudPictures;
  created_time?: string;    // ISO
  user?: { username?: string };
};

/* ====================== Config ====================== */
const KIRBY_API = "https://sector.fm/api/query";

/* ====================== Small utils ====================== */
function escKql(str: string) {
  return String(str).replace(/'/g, "\\'");
}

const fold = (s: string) =>
  (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function normTags(tags?: MixcloudTag[]): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    const n = fold(String(t?.name || ""));
    if (n) out.push(n);
  }
  return out;
}

function intersectCount(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  let c = 0;
  for (const x of b) if (set.has(x)) c++;
  return c;
}

function lastPathPiece(p?: string): string {
  if (!p) return "";
  try {
    const u = new URL(p);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    const parts = p.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }
}

function pickImage(p?: MixcloudPictures): string | null {
  return p?.large || p?.medium || p?.thumbnail || null;
}

function slugifyTitleForKirby(title: string): string {
  return (title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[,/]/g, " ")
    .replace(/[–—]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getBaseUrl() {
  // Build an absolute origin for server-side internal fetches
  const h = headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

async function withTimeout<T>(p: Promise<T>, ms = 6000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Timeout")), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/* ====================== Kirby helpers ====================== */
async function kql<T = any>(query: string): Promise<T | null> {
  const res = await fetch(`${KIRBY_API}?query=${encodeURIComponent(query)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return (j && j.result) ?? null;
}

async function fetchShow(slug: string): Promise<{
  title: string;
  host: string;
  showlink: string | null;
  tracklist: string | null;
  imageUrl: string | null;
} | null> {
  const page = (await kql<KirbyShowPage>(`page('shows/${slug}')`)) || null;
  if (!page) return null;

  const content = page.content || {};
  const title = content.title || page.title || slug;
  const host = content.host || "";
  const showlink = (content.showlink as string) || null;
  const tracklist = (content.tracklist as string) || null;

  let imageUrl: string | null = null;
  const firstFile = Array.isArray(page.files) && page.files.length ? String(page.files[0]) : null;
  if (firstFile) {
    const fu = await kql<string | { url?: string }>(`file('${firstFile}').url`);
    imageUrl = typeof fu === "string" ? fu : fu?.url || null;
  }

  return { title, host, showlink, tracklist, imageUrl };
}

/* ====================== Internal source fetch (absolute) ====================== */
async function fetchCachedShowsAbsolute(): Promise<MixcloudShow[]> {
  const base = getBaseUrl();

  // Try /api/shows-cache first
  try {
    const r = await withTimeout(fetch(`${base}/api/shows-cache`, { cache: "force-cache" }), 5000);
    if (r.ok) {
      const j = await r.json();
      const data = Array.isArray(j?.data) ? (j.data as MixcloudShow[]) : [];
      if (data.length) return data;
    }
  } catch { /* noop */ }

  // Then /api/shows-quick
  try {
    const r = await withTimeout(fetch(`${base}/api/shows-quick`, { cache: "force-cache" }), 5000);
    if (r.ok) {
      const j = await r.json();
      const data = Array.isArray(j?.data) ? (j.data as MixcloudShow[]) : [];
      if (data.length) return data;
    }
  } catch { /* noop */ }

  return [];
}

/* ====================== Mixcloud fallbacks ====================== */
async function fetchMixcloudShowMeta(showlink: string): Promise<MixcloudShow | null> {
  try {
    const u = new URL(showlink);
    const api = `https://api.mixcloud.com${u.pathname.replace(/\/+$/,"")}/`;
    const r = await withTimeout(fetch(api, { cache: "force-cache" }), 6000);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return (j && typeof j === "object") ? (j as MixcloudShow) : null;
  } catch {
    return null;
  }
}

async function fetchMixcloudChannelSlice(showlink: string, limit = 120): Promise<MixcloudShow[]> {
  // Derive channel from showlink, e.g. https://www.mixcloud.com/sectorfm/...
  let username = "sectorfm";
  try {
    const u = new URL(showlink);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 1) username = parts[0];
  } catch { /* default sectorfm */ }

  const out: MixcloudShow[] = [];
  let url = `https://api.mixcloud.com/${encodeURIComponent(username)}/cloudcasts/?limit=100`;

  while (url && out.length < limit) {
    const r = await withTimeout(fetch(url, { cache: "force-cache" }), 6000);
    if (!r.ok) break;
    const j = await r.json().catch(() => null);
    if (!j || !Array.isArray(j.data)) break;
    for (const it of j.data) out.push(it as MixcloudShow);
    url = j.paging?.next || "";
  }

  return out.slice(0, limit);
}

/* ====================== Related-shows server component ====================== */
async function RelatedShows({
  title,
  showlink,
}: {
  title: string;
  showlink: string | null;
}) {
  // 1) Try to load a cached list from your own API (fast), with timeout
  let list = await fetchCachedShowsAbsolute();

  // 2) Get the current show's tags (from cached list entry or Mixcloud meta)
  let currentTags: string[] = [];
  let thisUrl = showlink || "";
  if (!thisUrl) {
    const matchByTitle = list.find(s => fold(s.name || "") === fold(title));
    if (matchByTitle?.url) thisUrl = matchByTitle.url;
  }
  if (thisUrl) {
    const curInList = list.find(s => (s.url || "").replace(/\/+$/,"") === thisUrl.replace(/\/+$/,""));
    if (curInList?.tags?.length) {
      currentTags = normTags(curInList.tags);
    } else {
      const meta = await fetchMixcloudShowMeta(thisUrl);
      currentTags = normTags(meta?.tags);
    }
  }

  // 3) If we still have no tags OR no list, pull a small slice from Mixcloud to compute related
  if ((!currentTags.length || !list.length) && thisUrl) {
    const slice = await fetchMixcloudChannelSlice(thisUrl, 140);
    if (!list.length) list = slice;
    if (!currentTags.length) {
      const meta = slice.find(s => (s.url || "").replace(/\/+$/,"") === thisUrl.replace(/\/+$/,""));
      currentTags = normTags(meta?.tags);
    }
  }

  if (!currentTags.length || !list.length) return null;

  // 4) Score candidates by tag overlap (>= 2), exclude current show
  const thisKey = thisUrl ? thisUrl.replace(/\/+$/,"").toLowerCase() : "";
  const scored: Array<{ score: number; item: MixcloudShow; created: number }> = [];

  for (const it of list) {
    const u = (it.url || "").replace(/\/+$/,"").toLowerCase();
    const k = (it.key || "").replace(/\/+$/,"").toLowerCase();
    if (thisKey && (u === thisKey || (k && thisKey.endsWith(k)))) continue;

    const t = normTags(it.tags);
    const score = intersectCount(currentTags, t);
    if (score >= 2) {
      const created = Date.parse(it.created_time || "") || 0;
      scored.push({ score, item: it, created });
    }
  }

  // 5) Sort and take top 3
  scored.sort((a, b) => (b.score - a.score) || (b.created - a.created));
  const top = scored.slice(0, 3).map(s => s.item);

  if (!top.length) return null;

  // ===== Render "Episode Card"-style related items =====
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold mb-4">Related Shows</h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {top.map((it, idx) => {
          const img = pickImage(it.pictures);
          const fullTitle = it.name || "Untitled";
          // Split into "name" and "date" like your cards (use last dash/en-dash/em-dash)
          const seps = [" - ", " – ", " — "];
          let splitIdx = -1;
          for (const s of seps) {
            const i = fullTitle.lastIndexOf(s);
            if (i > splitIdx) splitIdx = i;
          }
          const namePart = splitIdx === -1 ? fullTitle : fullTitle.slice(0, splitIdx);
          const datePretty = splitIdx === -1 ? "" : fullTitle.slice(splitIdx + 3).trim();

          const mixUrl = it.url || "";
          const slugGuess = slugifyTitleForKirby(fullTitle) || lastPathPiece(it.key || it.url || "");

          const tagList = (it.tags || [])
            .filter(Boolean)
            .slice(0, 3)
            .map(t => t?.name || "")
            .filter(Boolean);

          return (
            <li key={`${slugGuess}-${idx}`} className="relative group">
              {/* Artwork: clicking plays in the footer (no navigation) */}
              <a
                href={mixUrl || "#"}
                {...(mixUrl ? { "data-mixcloud-play-button": mixUrl } : {})}
                className="block w-full aspect-square mb-2 rounded bg-[#111] overflow-hidden"
                title="Play"
              >
                {img ? (
                  <img
                    src={img}
                    alt={fullTitle}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[#111]" />
                )}
              </a>

              {/* Title → internal episode page */}
              <div className="text-black text-sm font-bold mb-1 line-clamp-2">
                <a
                  href={`/shows/${encodeURIComponent(slugGuess)}`}
                  className="hover:underline"
                >
                  {namePart}
                </a>
              </div>

              {/* Date exactly as written in title tail */}
              <div className="text-xs text-gray-600 mb-2">
                {datePretty}
              </div>

              {/* Clickable genre tags → search page (type=tag) */}
              {tagList.length > 0 && (
                <div className="flex gap-2 sm:gap-1 flex-wrap">
                  {tagList.map((tag) => {
                    const qs = new URLSearchParams({ q: tag, type: "tag" }).toString();
                    return (
                      <a
                        key={`${slugGuess}-${tag}`}
                        href={`/search?${qs}`}
                        className="bg-[#585555] text-white text-xs px-2 py-1 rounded hover:bg-[#707070] transition-colors duration-200"
                      >
                        {tag}
                      </a>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ====================== Page ====================== */
export default async function ShowPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug);
  const show = await fetchShow(slug);

  if (!show) {
    return (
      <main className="min-h-[60vh] bg-white text-black px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Show not found</h1>
          <p className="text-gray-600">
            We couldn’t find a show at <code>/shows/{slug}</code>.
          </p>
        </div>
      </main>
    );
  }

  const { title, host, showlink, tracklist, imageUrl } = show;

  return (
    <main className="min-h-[60vh] bg-white text-black px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold mb-6">{title}</h1>

        <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-6">
          {/* Image */}
          <div>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                className="w-full max-w-[280px] rounded-md bg-[#111] object-cover"
              />
            ) : (
              <div className="w-full max-w-[280px] aspect-square rounded-md bg-[#111]" />
            )}
          </div>

          {/* Details */}
          <div className="space-y-4">
            {/* Host */}
            <div>
              <div className="text-sm uppercase text-gray-500 tracking-wide">Host</div>
              <div className="text-lg font-semibold">{host || "—"}</div>
            </div>

            {/* Tracklist */}
            <div>
              <div className="text-sm uppercase text-gray-500 tracking-wide mb-1">Tracklist</div>
              {tracklist ? (
                <pre className="whitespace-pre-wrap text-sm text-black leading-relaxed bg-[#f5f5f5] rounded p-3">
{tracklist}
                </pre>
              ) : (
                <div className="text-gray-600 text-sm">No tracklist provided.</div>
              )}
            </div>
          </div>
        </div>

        {/* Related Shows (async, non-blocking) */}
        <Suspense fallback={<div className="mt-10 text-gray-500">Loading related shows…</div>}>

          <RelatedShows title={title} showlink={showlink} />
        </Suspense>
      </div>
    </main>
  );
}
