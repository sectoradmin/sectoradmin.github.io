"use client";

import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, Star } from "lucide-react";

import { fetchResidents, Resident } from "../lib/fetchResidents";
import {
  fetchHostEpisodes,
  resolveKirbySlugSmart,
  slugifyTitleForKirby,
} from "../lib/fetchHostEpisodes";
import { Disclosure } from "./disclosure";
import MixcloudFooterWidget from "../components/mixcloud-footer-widget";
import { useFavorites, slugFromMixcloudUrl } from "../app/hooks/useFavorites";
import { IfSubscribed } from "./if-subscribed";

/* --- Error boundary to absorb Mixcloud widget DOM conflicts --- */
class MixcloudSafeBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    // Silently absorb removeChild errors from Mixcloud widget DOM conflicts
    if (!err.message?.includes("removeChild")) {
      console.error(err);
    }
  }
  componentDidUpdate(_: any, prev: { hasError: boolean }) {
    // Auto-recover on next render cycle
    if (this.state.hasError && !prev.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    return this.props.children;
  }
}

/* ---------- Types (match mixcloud-shows.tsx) ---------- */
interface MixcloudShow {
  key: string;
  url: string;
  name: string;
  tags: Array<{ name: string }>;
  pictures?: { large?: string; medium?: string; thumbnail?: string };
  created_time?: string;
}

/* ---------------- helpers ---------------- */
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[‘’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const unslugifyLoose = (slug: string) =>
  slug.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

function canonMixcloudPath(input: string | null | undefined) {
  if (!input) return "";
  try {
    const u = new URL(input);
    return u.pathname.replace(/\/+$/,"").toLowerCase();
  } catch {
    return input.replace(/^https?:\/\/[^/]+/,"").replace(/\/+$/,"").toLowerCase();
  }
}

function displayDateFromTitle(title: string): string {
  const seps = [" - ", " – ", " — "];
  let idx = -1;
  for (const s of seps) {
    const i = title.lastIndexOf(s);
    if (i > idx) idx = i;
  }
  if (idx === -1) return "";
  return title.slice(idx + 3).trim();
}

type KirbyShowPage = {
  children: any[];
  content?: { title?: string; host?: string; showlink?: string; tracklist?: string };
  files?: string[];
  slug?: string;
  title?: string;
  uid?: string;
  url?: string;
};

const KIRBY_API = "https://sector.fm/api/query";
async function kql<T = any>(query: string): Promise<T | null> {
  const res = await fetch(`${KIRBY_API}?query=${encodeURIComponent(query)}`, { cache: "force-cache" });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return (j && j.result) ?? null;
}
async function fetchShowDetails(slug: string): Promise<{
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

/* Mixcloud source already loaded by main app */
function getMixcloudSource(): MixcloudShow[] {
  if (typeof window === "undefined") return [];
  const w: any = window as any;
  const a = (Array.isArray(w.__SECTOR_ALL_SHOWS__) && w.__SECTOR_ALL_SHOWS__) || null;
  if (a?.length) return a;
  const b = (Array.isArray(w.__MIXCLOUD_ALL_SHOWS__) && w.__MIXCLOUD_ALL_SHOWS__) || null;
  if (b?.length) return b;
  
  // Try to get from the main app's cached shows if available
  const mainAppShows = (Array.isArray(w.__MAIN_APP_CACHED_SHOWS__) && w.__MAIN_APP_CACHED_SHOWS__) || null;
  if (mainAppShows?.length) return mainAppShows;
  
  return [];
}

const fold = (s: string) =>
  (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function normTags(tags?: Array<{ name?: string }>): string[] {
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
function pickImage(p?: { large?: string; medium?: string; thumbnail?: string } | null) {
  return p?.large || p?.medium || p?.thumbnail || null;
}

/* ===================== Residents Layout ===================== */
export default function ResidentsLayout({
  allShows = [],
  showsLoaded = false,
  quickShows = [],
  quickShowsLoaded = false,
  onTagSearch,
}: {
  allShows?: MixcloudShow[];
  showsLoaded?: boolean;
  quickShows?: MixcloudShow[];
  quickShowsLoaded?: boolean;
  onTagSearch?: (query: string, type: string) => void;
} = {}) {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const selectedResident = search.get("r");
  const selectedShow = search.get("s");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchResidents();
        if (mounted) setResidents(data);
      } catch (e: any) {
        if (mounted) setError(String(e?.message ?? e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const disclosureRef = useRef<HTMLDivElement>(null);

  const onResidentClick = (r: Resident, index: number) => {
    const slug = slugify(r.title || String(index));
    const params = new URLSearchParams(search.toString());
    params.set("r", slug);
    params.delete("s");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clearResidentSelection = () => {
    const params = new URLSearchParams(search.toString());
    params.delete("r");
    params.delete("s");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clearEpisodeSelection = () => {
    const params = new URLSearchParams(search.toString());
    params.delete("s");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (selectedResident && disclosureRef.current) {
      // Double rAF ensures the DOM has fully laid out after the content swap
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          disclosureRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
        });
      });
    }
  }, [selectedResident]);

  if (loading) return <p className="text-black">Loading residents…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!residents.length) return <p className="text-black">No residents found.</p>;

  return (
    <MixcloudSafeBoundary>
      <div ref={disclosureRef}>
      <Disclosure
        defaultOpen={false}
        className="bg-white [&_svg]:text-black"
        summary={<h2 className="text-black font-bold text-xl text-center">Residents</h2>}
      >
        <div className="bg-white relative">
        {!selectedResident ? (
          <>
            {/* ===== RESIDENTS GRID ===== */}
              <ul className="residents">
                {residents.map((r, i) => {
                  const content = (
                    <figure>
                      {r.imageUrl ? (
                        <img
                          src={r.imageUrl}
                          alt={r.title || "Resident"}
                          className="resident-img"
                          width={200}
                          height={200}
                        />
                      ) : (
                        <div className="resident-img placeholder" aria-hidden />
                      )}
                      <figcaption className="resident-caption">{r.title}</figcaption>
                    </figure>
                  );
                  return (
                    <li key={`${r.title}-${i}`}>
                      <button
                        onClick={() => onResidentClick(r, i)}
                        className="reset-btn"
                        aria-label={`Open ${r.title}`}
                        title={r.title || "Open resident"}
                      >
                        {content}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <style jsx>{`
                .residents {
                  list-style: none;
                  padding: 0;
                  margin: 0;
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                  gap: 16px;
                  padding-bottom: 16px;
                }
              .residents li { display: flex; flex-direction: column; }
                .resident-img {
                  width: 100%;
                  aspect-ratio: 1;
                  display: block;
                  object-fit: cover;
                  border-radius: 4px;
                  background: #111;
                }
                .resident-img.placeholder { background: #222; }
                .resident-caption { margin-top: 8px; font-size: 14px; line-height: 1.3; color: #000; }
                .reset-btn {
                  background: transparent; border: 0; padding: 0; margin: 0; cursor: pointer; color: inherit; text-align: inherit;
                }
                .reset-btn:hover .resident-caption { text-decoration: underline; }
              `}</style>
            </>
        ) : !selectedShow ? (
          // ===== RESIDENT DETAIL (episodes grid) + top-right chevron-back =====
          <ResidentDetailInline slug={selectedResident} onBack={clearResidentSelection} onTagSearch={onTagSearch} />
          ) : (
          // ===== EPISODE DETAIL (inline) + top-right chevron-back =====
          <EpisodeDetailInline showSlug={selectedShow} onBack={clearEpisodeSelection} onTagSearch={onTagSearch} />
          )}

        {/* Ensure single footer widget */}
          <div className="mt-6">
            <MaybeMixcloudFooter />
          </div>
        </div>
      </Disclosure>
      </div>
    </MixcloudSafeBoundary>
  );
}

/* ---------- Only create ONE Mixcloud footer across the page ---------- */
function MaybeMixcloudFooter() {
  const [shouldMount, setShouldMount] = useState(false);
  useEffect(() => {
    const hasContainer = !!document.querySelector(".mixcloud-footer-widget-container");
    const claimed = (window as any).__MIXCLOUD_FOOTER_CLAIMED === true;
    if (!hasContainer && !claimed) {
      (window as any).__MIXCLOUD_FOOTER_CLAIMED = true;
      setShouldMount(true);
    }
  }, []);
  if (!shouldMount) return null;
  return <MixcloudFooterWidget />;
}

/* ---------------- Resident detail (episodes grid) ---------------- */
function ResidentDetailInline({ slug, onBack, onTagSearch }: { slug: string; onBack: () => void; onTagSearch?: (query: string, type: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const hostName = useMemo(() => unslugifyLoose(decodeURIComponent(slug)), [slug]);
  const [episodes, setEpisodes] = useState<
    Array<{ slug: string; title: string; showlink: string | null; imageUrl: string | null }>
  >([]);
  const [displayName, setDisplayName] = useState<string>(unslugifyLoose(decodeURIComponent(slug)));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Resident profile (name, photo, bio)
  const [profile, setProfile] = useState<{ name: string; imageUrl: string | null; bio: string | null } | null>(null);

  // Preloaded Mixcloud shows
  const showsSource = useMemo<MixcloudShow[]>(() => getMixcloudSource(), []);
  const showsByCanon = useMemo(() => {
    const m = new Map<string, MixcloudShow>();
    for (const s of showsSource) {
      const fromUrl = canonMixcloudPath(s?.url);
      const fromKey = canonMixcloudPath(s?.key);
      if (fromUrl) m.set(fromUrl, s);
      if (fromKey) m.set(fromKey, s);
    }
    return m;
  }, [showsSource]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        // Resolve the real resident name from the slug first
        let resolvedName = hostName;
        let imageUrl: string | null = null;
        try {
          const allResidents = await fetchResidents();
          const decodedSlug = decodeURIComponent(slug);

          // Build a map of slug → resident for fast lookup
          const residentsBySlug = new Map<string, (typeof allResidents)[0]>();
          for (const r of allResidents) {
            residentsBySlug.set(slugify(r.title || ""), r);
          }

          // 1. Exact slug match (e.g. "chemical-lex" matches resident "Chemical Lex")
          let match = residentsBySlug.get(decodedSlug);

          // 2. If no exact match, try progressively shorter slug prefixes.
          //    This handles colon-separated show names like "Chemical Lex: Pimp Baby Jamz"
          //    whose slug is "chemical-lex-pimp-baby-jamz" — we try removing words from
          //    the end until we find a matching resident (e.g. "chemical-lex").
          if (!match) {
            const parts = decodedSlug.split("-");
            for (let i = parts.length - 1; i >= 1; i--) {
              const prefix = parts.slice(0, i).join("-");
              const prefixMatch = residentsBySlug.get(prefix);
              if (prefixMatch) {
                match = prefixMatch;
                break;
              }
            }
          }

          if (match) {
            resolvedName = match.title || resolvedName;
            imageUrl = match.imageUrl ?? null;
          }
        } catch {}

        if (!mounted) return;
        setDisplayName(resolvedName);

        // Check for preloaded host episodes data first
        const preloadedData = typeof window !== 'undefined' ? (window as any).__PRELOADED_SHOW_DATA__ : null;
        let data;

        if (preloadedData && preloadedData.hostEpisodes) {
          console.log('Using preloaded host episodes data');
          data = preloadedData.hostEpisodes;
        } else {
          // Use resolved name for episode lookup (handles apostrophes, accents, etc.)
          console.log('Loading host episodes on demand');
          data = await fetchHostEpisodes(resolvedName);
        }

        if (!mounted) return;
        setEpisodes(
          data.map((d: any) => ({
            slug: d.slug, title: d.title, showlink: d.showlink ?? null, imageUrl: d.imageUrl ?? null
          }))
        );
        setDisplayName(data[0]?.host || resolvedName);

        // Resident photo & bio via Kirby
        let name = resolvedName;
        const uidGuess = decodeURIComponent(slug).replace(/-/g, "_");
        const fetchKql = async (kqlQuery: string) => {
          const url = `${KIRBY_API}?query=${encodeURIComponent(kqlQuery)}`;
          const res = await fetch(url, { cache: "force-cache" });
          if (!res.ok) return null;
          const j = await res.json().catch(() => null);
          return j?.result ?? null;
        };
        let pageObj: any = await fetchKql(`page('residents/${uidGuess}')`);
        if (!pageObj) pageObj = await fetchKql(`page('residents/${decodeURIComponent(slug)}')`);
        if (!pageObj) {
          const esc = name.replace(/'/g, "\\'");
          pageObj = await fetchKql(`site.find('residents').children.findBy('title','${esc}')`);
        }
        let bio: string | null = null;
        if (pageObj) {
          const c = pageObj?.content || {};
          bio = c?.bio ?? c?.Bio ?? null;
          if (!imageUrl && Array.isArray(pageObj.files) && pageObj.files.length) {
            const fu = await fetchKql(`file('${pageObj.files[0]}').url`);
            imageUrl = typeof fu === "string" ? fu : fu?.url || null;
          }
        }
        if (!mounted) return;
        setProfile({ name, imageUrl, bio });
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [hostName, slug]);

  // Fallback: fetch Mixcloud tags for episodes not present in showsByCanon
  const [fallbackMeta, setFallbackMeta] = useState<Record<string, { tags: string[] }>>({});
  useEffect(() => {
    let cancelled = false;
    const work = episodes
      .map((e) => ({ canon: canonMixcloudPath(e.showlink) }))
      .filter(({ canon }) => !!canon && !showsByCanon.has(canon!));
    if (!work.length) return;

    async function fetchOne(canon: string) {
      const api = `https://api.mixcloud.com${canon}/`;
      try {
        const res = await fetch(api, { cache: "force-cache" });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        const tags = Array.isArray(j.tags) ? j.tags.map((t: any) => t?.name).filter(Boolean).slice(0, 3) : [];
        setFallbackMeta((prev) => ({ ...prev, [canon]: { tags } }));
      } catch {}
    }

    const limit = Math.min(8, Math.max(2, work.length));
    let i = 0;
    const runners = Array.from({ length: limit }).map(async () => {
      while (i < work.length && !cancelled) {
        const idx = i++;
        await fetchOne(work[idx].canon!);
      }
    });
    Promise.all(runners);
    return () => { cancelled = true; };
  }, [episodes, showsByCanon]);

  useEffect(() => {
    (window as any).MixcloudButtons?.load?.();
    (window as any).Mixcloud?.load?.();
  }, [episodes.length]);

  const openEpisodeInline = async (ep: { slug: string; title: string; showlink: string | null }) => {
    let showSlug: string | null = null;
    try {
      showSlug = await resolveKirbySlugSmart({ slug: ep.slug, title: ep.title, showlink: ep.showlink });
    } catch {}
    if (!showSlug) showSlug = slugifyTitleForKirby(ep.title || "") || ep.slug;

    const params = new URLSearchParams(search.toString());
    params.set("r", decodeURIComponent(slug));
    params.set("s", showSlug);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="p-4 relative">
      {/* Top-right chevron (back to full Residents grid) */}
      <div className="absolute right-0 top-0 z-20 p-2">
        <button
          onClick={onBack}
          aria-label="Back to Residents"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-200 ring-1 ring-gray-300 text-black hover:bg-gray-300"
          title="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Header: Name, Photo, Bio */}
      <div className="flex items-start gap-4 mb-4">
        {profile?.imageUrl ? (
          <img
            src={profile.imageUrl}
            alt={profile.name || displayName}
            className="w-24 h-24 rounded object-cover bg-[#111] flex-shrink-0"
            width={96}
            height={96}
          />
        ) : (
          <div className="w-24 h-24 rounded bg-[#222] flex-shrink-0" aria-hidden />
        )}
        <div className="min-w-0">
          <h3 className="text-black font-bold text-lg">{profile?.name || displayName}</h3>
          {profile?.bio && (
            <p className="text-gray-600 text-sm whitespace-pre-line mt-1 font-akzid">{profile.bio}</p>
          )}
          <div className="text-gray-500 text-sm mt-1 font-akzid">
            {loading ? "Loading…" : `${episodes.length} episode${episodes.length === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      {err && <div className="text-red-600 text-sm mb-4">{err}</div>}

      {!episodes.length && !loading ? (
        <div className="text-gray-600">No episodes found for this host yet.</div>
      ) : (
        <ul className="episodes">
          {episodes.map((ep) => {
            const canon = canonMixcloudPath(ep.showlink);
            const matchedShow = canon ? showsByCanon.get(canon) : undefined;
            const tagsFromShows = matchedShow?.tags ?? [];
            const tagsFromFallback = fallbackMeta[canon]?.tags ?? [];
            const tags = (tagsFromShows.length
              ? tagsFromShows.map((t) => ({ name: t.name }))
              : tagsFromFallback.map((n) => ({ name: n }))).slice(0, 3);

            return (
              <EpisodeCard
                key={ep.slug}
                ep={ep}
                tags={tags}
                onOpenInline={() => openEpisodeInline(ep)}
                onTagSearch={onTagSearch}
              />
            );
          })}
        </ul>
      )}

      <style jsx>{`
        .episodes {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }
      `}</style>
    </section>
  );
}

/* -------- Episode card (compact; matches archive behavior) -------- */
function EpisodeCard({
  ep,
  tags = [],
  onOpenInline,
  onTagSearch,
}: {
  ep: { slug: string; title: string; showlink: string | null; imageUrl: string | null };
  tags?: Array<{ name: string }>;
  onOpenInline: () => void;
  onTagSearch?: (query: string, type: string) => void;
}) {
  const { add, removeBySlug, has, slugFromMixcloudUrl } = useFavorites();
  const [signinTipSlug, setSigninTipSlug] = useState<string | null>(null);
  const tipTimerRef = useRef<number | null>(null);

  function showSignInTip(slug: string) {
    setSigninTipSlug(slug);
    if (tipTimerRef.current) window.clearTimeout(tipTimerRef.current);
    tipTimerRef.current = window.setTimeout(() => setSigninTipSlug(null), 1800);
  }
  useEffect(() => () => { if (tipTimerRef.current) clearTimeout(tipTimerRef.current); }, []);

  const mixcloudSlug = ep.showlink ? slugFromMixcloudUrl(ep.showlink) : "";
  const isFav = ep.showlink ? has(mixcloudSlug) : false;

  const mixcloudRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const el = mixcloudRef.current;
    if (el && ep.showlink) {
      el.setAttribute("data-mixcloud-play-button", ep.showlink);
    }
    return () => {
      if (el) {
        el.removeAttribute("data-mixcloud-play-button");
      }
    };
  }, [ep.showlink]);

  const [namePart, datePretty] = useMemo(() => {
  const seps = [" - ", " – ", " — "];
  let idx = -1;
  for (const s of seps) {
    const i = ep.title.lastIndexOf(s);
    if (i > idx) idx = i;
  }
  if (idx === -1) return [ep.title, ""];
  return [ep.title.slice(0, idx), ep.title.slice(idx + 3).trim()];
}, [ep.title]);

  return (
    <li className="relative group">
      {/* Favorite */}
      {ep.showlink && (
        <>
        <button
          aria-label="Favorite"
            onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const s = slugFromMixcloudUrl(ep.showlink!);
              try {
                isFav ? await removeBySlug(s) : await add(ep.showlink!);
              } catch (err: any) {
                const msg = String(err?.message || err?.code || err).toLowerCase();
                if (/(not\s*(signed\s*in|authenticated)|unauth|permission|denied|auth)/.test(msg)) {
                  showSignInTip(s);
                } else {
                  console.error("Error adding favorite:", err);
                }
              }
          }}
          className="absolute top-2 right-2 z-20 inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-200 ring-1 ring-gray-300 hover:bg-gray-300 transition leading-none select-none"
        >
            <Star className={`w-5 h-5 ${isFav ? "fill-white text-white" : "text-black"}`} strokeWidth={2} />
        </button>

          {signinTipSlug === slugFromMixcloudUrl(ep.showlink!) && (
            <div
              role="status"
              aria-live="polite"
              className="absolute top-12 right-2 z-30 px-2 py-1 text-[11px] rounded bg-black text-white shadow-lg border border-black/20 pointer-events-none"
            >
              Sign in to favorite
            </div>
          )}
        </>
      )}

      {/* Art: play footer + open inline */}
      <a
  ref={mixcloudRef}
  href={ep.showlink ?? "#"}
  className="block"
        onClick={(e) => {
    e.preventDefault();
    (window as any).MixcloudButtons?.load?.();
    (window as any).Mixcloud?.load?.();
          onOpenInline();
        }}
      >
        {ep.imageUrl ? (
          <img src={ep.imageUrl} alt={ep.title} className="episode-img" />
        ) : (
          <div className="episode-img placeholder" />
        )}

        {/* Title / Date */}
        <div className="pt-1 text-black text-sm font-bold mb-1 line-clamp-2">{namePart}</div>
        <div className="text-black text-xs text-gray-600 mb-2 font-akzid">
          {datePretty || displayDateFromTitle(ep.title)}
        </div>

        {/* Tags */}
        <div className="flex gap-2 sm:gap-1 flex-wrap">
          {tags.slice(0, 3).map((tag) => (
            <button
              key={`${ep.slug}-${tag.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onTagSearch) {
                  onTagSearch(tag.name, "tag");
                } else {
                  const params = new URLSearchParams({ q: tag.name, type: "tag" });
                  router.push(`/search?${params.toString()}`);
                }
              }}
              className="bg-gray-200 text-black text-[9px] px-2 py-1 rounded hover:bg-gray-300 transition-colors duration-200 cursor-pointer font-akzid"
            >
              {tag.name}
            </button>
          ))}
        </div>
      </a>

      <style jsx>{`
        .episode-img {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 6px;
          object-fit: cover;
          background: #111;
        }
        .episode-img.placeholder { background: #222; }
      `}</style>
    </li>
  );
}


/* ---------------- Episode detail inline (Play button + tags under artwork; no nav) ---------------- */
function EpisodeDetailInline({
  showSlug,
  onBack,
  onTagSearch,
}: {
  showSlug: string;
  onBack: () => void;
  onTagSearch?: (query: string, type: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<{
    title: string;
    host: string;
    showlink: string | null;
    tracklist: string | null;
    imageUrl: string | null;
  } | null>(null);

  // Episode genre tags (from preloaded cache or Mixcloud API)
  const [tags, setTags] = useState<string[]>([]);

  // Hidden anchor that Mixcloud's script will intercept
  const playAnchorRef = useRef<HTMLAnchorElement | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        // Check for preloaded data first
        const preloadedData = typeof window !== 'undefined' ? (window as any).__PRELOADED_SHOW_DATA__ : null;
        if (preloadedData && preloadedData.showDetails) {
          console.log('Using preloaded show details');
          if (!mounted) return;
          
          const d = preloadedData.showDetails;
          if (d) {
            setData(d);
          } else {
            // Fallback to Mixcloud data if show not found in Kirby
            const list = getMixcloudSource();
            const mixcloudShow = list.find((s) => {
              const slugGuess = slugifyTitleForKirby(s.name || "") || 
                              (s.key || s.url || "").split("/").filter(Boolean).pop() || "";
              return slugGuess === decodeURIComponent(showSlug);
            });
            
            if (mixcloudShow) {
              setData({
                title: mixcloudShow.name || "Untitled",
                host: mixcloudShow.name?.split(' - ')[0] || "Unknown",
                showlink: mixcloudShow.url || null,
                tracklist: null,
                imageUrl: pickImage(mixcloudShow.pictures || null),
              });
            } else {
              setErr("Show not found");
            }
          }
          
          // Clear the preloaded data after use
          if (typeof window !== 'undefined') {
            delete (window as any).__PRELOADED_SHOW_DATA__;
          }
          
          if (mounted) setLoading(false);
          return;
        }
        
        // Fallback to normal API call if no preloaded data
        const d = await fetchShowDetails(decodeURIComponent(showSlug));
        if (!mounted) return;
        
        if (d) {
          // Show exists in Kirby CMS
          setData(d);
        } else {
          // Show doesn't exist in Kirby, try to find it in Mixcloud data
          console.log('Show not found in Kirby, searching Mixcloud data for:', showSlug);
          const list = getMixcloudSource();
          console.log('Available Mixcloud shows:', list.length);
          
          // If no shows available, try to fetch them
          if (list.length === 0) {
            console.log('No Mixcloud shows available, trying to fetch...');
            try {
              const response = await fetch('/api/shows-cache');
              if (response.ok) {
                const data = await response.json();
                const fetchedShows = data.data || [];
                console.log('Fetched shows:', fetchedShows.length);
                // Update the global cache
                if (typeof window !== 'undefined') {
                  (window as any).__MAIN_APP_CACHED_SHOWS__ = fetchedShows;
                }
                list.push(...fetchedShows);
              }
            } catch (error) {
              console.warn('Failed to fetch shows:', error);
            }
          }
          
          let mixcloudShow = list.find((s) => {
            const slugGuess = slugifyTitleForKirby(s.name || "") || 
                            (s.key || s.url || "").split("/").filter(Boolean).pop() || "";
            return slugGuess === decodeURIComponent(showSlug);
          });
          
          // If not found with exact slug match, try a more flexible search
          if (!mixcloudShow) {
            console.log('Exact slug match failed, trying flexible search...');
            mixcloudShow = list.find((s) => {
              const showName = s.name || "";
              const showUrl = s.url || "";
              const decodedSlug = decodeURIComponent(showSlug);
              
              console.log('Checking show:', showName, 'URL:', showUrl);
              
              // Try matching the show name directly
              const nameSlug = slugifyTitleForKirby(showName);
              if (nameSlug === decodedSlug) {
                console.log('Found by name slug match');
                return true;
              }
              
              // Try matching the URL slug directly
              const urlSlug = slugFromMixcloudUrl(showUrl);
              if (urlSlug === decodedSlug) {
                console.log('Found by URL slug match');
                return true;
              }
              
              // Try matching just the date part
              const datePart = decodedSlug.replace(/^[^-]+-/, ''); // Remove "svntos-" part
              const showDatePart = showName.split(' - ')[1] || '';
              const showDateSlug = slugifyTitleForKirby(showDatePart);
              if (showDateSlug === datePart) {
                console.log('Found by date part match');
                return true;
              }
              
              // Try partial matching - check if the slug is contained in the show name
              const normalizedShowName = showName.toLowerCase().replace(/[^a-z0-9]/g, '-');
              if (normalizedShowName.includes(decodedSlug.toLowerCase())) {
                console.log('Found by partial name match');
                return true;
              }
              
              return false;
            });
          }
          
          if (mixcloudShow) {
            console.log('Found show in Mixcloud data:', mixcloudShow.name);
            // Found in Mixcloud data, create show data from Mixcloud
            setData({
              title: mixcloudShow.name || "Untitled",
              host: mixcloudShow.name?.split(' - ')[0] || "Unknown",
              showlink: mixcloudShow.url || null,
              tracklist: null,
              imageUrl: pickImage(mixcloudShow.pictures || null),
            });
          } else {
            console.log('Show not found in Mixcloud data either');
            setErr("Show not found");
          }
        }
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [showSlug]);

  // Pull tags from preloaded Mixcloud cache; fallback to Mixcloud API if needed
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!data) return;
      let out: string[] = [];

      const list = getMixcloudSource();
      const byUrl =
        data.showlink &&
        list.find(
          (s) =>
            canonMixcloudPath(s?.url) === canonMixcloudPath(data.showlink!) ||
            canonMixcloudPath(s?.key) === canonMixcloudPath(data.showlink!)
        );
      const byTitle = !byUrl && list.find((s) => fold(s?.name || "") === fold(data.title || ""));

      const found = byUrl || byTitle || null;
      if (found?.tags?.length) {
        out = found.tags.map((t) => t?.name || "").filter(Boolean).slice(0, 5);
      } else if (data.showlink) {
        try {
          const canon = canonMixcloudPath(data.showlink);
          if (canon) {
            const res = await fetch(`https://api.mixcloud.com${canon}/`, { cache: "force-cache" });
            if (res.ok) {
              const j = await res.json();
              out = Array.isArray(j.tags) ? j.tags.map((t: any) => t?.name).filter(Boolean).slice(0, 5) : [];
            }
          }
        } catch {/* ignore */}
      }

      if (mounted) setTags(out);
    })();
    return () => { mounted = false; };
  }, [data?.showlink, data?.title, data]);

  // Keep widget scripts “hot”
  useEffect(() => {
    (window as any).MixcloudButtons?.load?.();
    (window as any).Mixcloud?.load?.();
  }, [data?.showlink]);

  // Helpers to inspect current footer widget feed (to no-op if already playing)
  const normalizeFeed = (u?: string | null) => {
    if (!u) return "";
    try {
      const url = new URL(u);
      return url.href.replace(/\/+$/, "").toLowerCase();
      } catch {
      return String(u).replace(/\/+$/, "").toLowerCase();
    }
  };
  const getFooterCurrentFeed = () => {
    const iframe = document.querySelector<HTMLIFrameElement>(".mixcloud-footer-widget-container iframe");
    if (!iframe) return "";
    try {
      const src = new URL(iframe.src);
      const feed = src.searchParams.get("feed");
      return feed ? decodeURIComponent(feed) : "";
    } catch {
      return "";
    }
  };

  // Play button: trigger Mixcloud footer WITHOUT navigation
  const handlePlay = () => {
    if (!data?.showlink) return;

    // If already playing this feed, do nothing
    const want = normalizeFeed(data.showlink);
    const current = normalizeFeed(getFooterCurrentFeed());
    if (want && current && want === current) return;

    // Ensure Mixcloud scripts are active
    (window as any).MixcloudButtons?.load?.();
    (window as any).Mixcloud?.load?.();

    // Use a hidden anchor that prevents default navigation, then dispatch a real click
    const a = playAnchorRef.current;
    if (!a) return;
    a.setAttribute("href", data.showlink);
    a.setAttribute("data-mixcloud-play-button", data.showlink);

    // Dispatch a cancelable click so Mixcloud's event handler can intercept it
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
    a.dispatchEvent(evt);
  };

  return (
    <section className="p-4 relative">
      {/* Top-right chevron (back to resident grid) */}
      <div className="absolute right-0 top-0 z-20 p-2">
        <button
          onClick={onBack}
          aria-label="Back to episodes"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-200 ring-1 ring-gray-300 text-black hover:bg-gray-300"
          title="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {loading && <div className="text-gray-600">Loading show…</div>}
      {err && <div className="text-red-600">Error: {err}</div>}
      {!loading && !data && <div className="text-gray-600">Show not found.</div>}

      {data && (
        <>
          <h1 className="text-black text-xl font-bold mb-4">{data.title}</h1>

          <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-6">
            {/* Left column: artwork + Play button + tags */}
            <div>
              {data.imageUrl ? (
                <img
                  src={data.imageUrl}
                  alt={data.title}
                  className="w-full max-w-[280px] rounded-md bg-[#111] object-cover"
                />
              ) : (
                <div className="w-full max-w-[280px] aspect-square rounded-md bg-[#111]" />
              )}

              {/* Hidden anchor used to trigger Mixcloud footer WITHOUT navigation */}
              <a
                ref={playAnchorRef}
                href={data.showlink ?? "#"}
                onClick={(e) => e.preventDefault()} // hard-stop navigation even if script misses
                style={{ position: "absolute", left: "-99999px", width: 1, height: 1, overflow: "hidden" }}
                tabIndex={-1}
                aria-hidden="true"
              />

              {/* Play Episode button */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handlePlay}
                  disabled={!data.showlink}
                  className="px-3 py-2 text-sm rounded bg-black text-white hover:bg-[#222] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Play Episode
                </button>
              </div>

              {/* Episode tags (under artwork) */}
                {tags.length > 0 && (
                  <div className="mt-2 flex gap-2 sm:gap-1 flex-wrap">
                    {tags.slice(0, 5).map((tag) => (
                      <button
                        key={`detail-tag-${tag}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onTagSearch) {
                            onTagSearch(tag, "tag");
                          } else {
                            const qs = new URLSearchParams({ q: tag, type: "tag" }).toString();
                            router.push(`/search?${qs}`);
                          }
                        }}
                        className="bg-gray-200 text-black text-[9px] px-2 py-1 rounded hover:bg-gray-300 transition-colors duration-200 cursor-pointer font-akzid"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

            </div>

            {/* Right column: Details */}
            <div className="space-y-4">
              <div>
                <div className="text-sm uppercase text-gray-500 tracking-wide">Host</div>
                {data.host ? (
                  <button
                    onClick={() => {
                      // Normalize accented characters before slugifying
                      const normalizedHost = fold(data.host);
                      const hostSlug = slugify(normalizedHost);
                      const params = new URLSearchParams(search.toString());
                      params.set("r", hostSlug);
                      params.delete("s");
                      router.push(`${pathname}?${params.toString()}`, { scroll: false });
                    }}
                    className="text-lg font-semibold text-black hover:text-blue-600 hover:underline transition-colors duration-200 cursor-pointer"
                    title="View resident profile and shows"
                  >
                    {data.host}
                  </button>
                ) : (
                  <div className="text-lg font-semibold text-black">—</div>
                )}
              </div>

              <div>
                <div className="text-sm uppercase text-gray-500 tracking-wide mb-1">Tracklist</div>
                <IfSubscribed
      fallback={<div className="text-gray-600 text-sm">Become a Sector Supporter to view archived tracklists!</div>}
      whileChecking={<div className="text-gray-400 text-sm">Checking access…</div>}
    >{data.tracklist ? (
                  <pre className="whitespace-pre-wrap text-sm text-black leading-relaxed bg-[#f5f5f5] rounded p-3">
{data.tracklist}
                  </pre>
                ) : (
                  <div className="text-gray-600 text-sm">No tracklist provided.</div>
                )}</IfSubscribed>
              </div>
            </div>
          </div>

          {/* Related shows kept below */}
          <RelatedShowsInline currentTitle={data.title} currentMixcloud={data.showlink} onTagSearch={onTagSearch} />
        </>
      )}
    </section>
  );
}






/* -------------- Related shows (compact like episode cards; loading + latest fallback; no footer play) -------------- */
function RelatedShowsInline({
  currentTitle,
  currentMixcloud,
  onTagSearch,
}: {
  currentTitle: string;
  currentMixcloud: string | null;
  onTagSearch?: (query: string, type: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const residentSlug = search.get("r") || "";

  const [items, setItems] = useState<
    Array<{ title: string; mixUrl: string; slug: string; imageUrl: string | null; tags: string[]; created?: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchSliceFallback(limit = 120): Promise<MixcloudShow[]> {
      let username = "sectorfm";
      try {
        if (currentMixcloud) {
          const u = new URL(currentMixcloud);
          const parts = u.pathname.split("/").filter(Boolean);
          if (parts.length >= 1) username = parts[0];
        }
      } catch {}
      const out: MixcloudShow[] = [];
      let url = `https://api.mixcloud.com/${encodeURIComponent(username)}/cloudcasts/?limit=100`;
      try {
        while (url && out.length < limit) {
          const r = await fetch(url, { cache: "force-cache" });
          if (!r.ok) break;
          const j = await r.json().catch(() => null);
          if (!j || !Array.isArray(j.data)) break;
          for (const it of j.data) out.push(it as MixcloudShow);
          url = j.paging?.next || "";
        }
      } catch {}
      return out.slice(0, limit);
    }

    (async () => {
      setLoading(true);
      setNote(null);

      // Source list
      let list = getMixcloudSource();
      if (!list.length) list = await fetchSliceFallback(140);

      // Normalize current show URL
      let thisUrl = currentMixcloud || "";
      if (!thisUrl && list.length) {
        const byTitle = list.find((s) => fold(s.name || "") === fold(currentTitle));
        if (byTitle?.url) thisUrl = byTitle.url;
      }
      const curKey = thisUrl ? thisUrl.replace(/\/+$/, "").toLowerCase() : "";

      // Current tags
      let currentTags: string[] = [];
      if (thisUrl) {
        const curInList = list.find((s) => (s.url || "").replace(/\/+$/, "") === thisUrl.replace(/\/+$/, ""));
        if (curInList?.tags?.length) currentTags = normTags(curInList.tags);
      }

      const mapToCard = (it: MixcloudShow) => {
        const fullTitle = it.name || "Untitled";
        const slugGuess =
          slugifyTitleForKirby(fullTitle) ||
          (it.key || it.url || "").split("/").filter(Boolean).pop() ||
          "";
        return {
          title: fullTitle,
          mixUrl: it.url || "",
          slug: slugGuess,
          imageUrl: pickImage(it.pictures || null),
          tags: (it.tags || [])
            .filter(Boolean)
            .slice(0, 3)
            .map((t) => t?.name || "")
            .filter(Boolean),
          created: Date.parse(it.created_time || "") || 0,
        };
      };

      // Latest 5 (will be responsive)
      const latest = [...list]
        .filter((it) => (it.url || "").replace(/\/+$/, "").toLowerCase() !== curKey)
        .sort((a, b) => (Date.parse(b.created_time || "") || 0) - (Date.parse(a.created_time || "") || 0))
        .slice(0, 5)
        .map(mapToCard);

      if (!currentTags.length || !list.length) {
        if (mounted) {
          setItems(latest);
          setNote("No Related Shows. Here's the Latest from Sector.");
          setLoading(false);
        }
        return;
      }

      const scored: Array<{ score: number; item: MixcloudShow; created: number }> = [];
      const same = (it: MixcloudShow) => {
        const u = (it.url || "").replace(/\/+$/, "").toLowerCase();
        const k = (it.key || "").replace(/\/+$/, "").toLowerCase();
        return curKey && (u === curKey || (k && curKey.endsWith(k)));
      };

      // Score all shows with matching tags (prioritize higher scores)
      for (const it of list) {
        if (same(it)) continue;
        const t = normTags(it.tags);
        const score = intersectCount(currentTags, t);
        if (score >= 1) {
          const created = Date.parse(it.created_time || "") || 0;
          scored.push({ score, item: it, created });
        }
      }

      let cards: ReturnType<typeof mapToCard>[] = [];
      let fallbackNote: string | null = null;

      if (scored.length) {
        // Sort by tag overlap score (higher scores first), then by creation date (newer first)
        scored.sort((a, b) => {
          // Primary sort: by number of matching tags (descending)
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          // Secondary sort: by creation date (newer first)
          return b.created - a.created;
        });
        cards = scored.slice(0, 5).map((s) => mapToCard(s.item));
      } else {
        cards = latest;
        fallbackNote = "No Related Shows. Here's the Latest from Sector.";
      }

      if (mounted) {
        setItems(cards);
        setNote(fallbackNote);
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [currentTitle, currentMixcloud]);

  function scrollToResidents() {
  const lower = (s?: string | null) => (s || "").trim().toLowerCase();
  const isResidentsText = (el: Element | null | undefined) =>
    !!el && lower(el.textContent).includes("residents");

  const findAnchor = (): Element | null =>
    document.querySelector("[data-residents-root]") ||
    document.getElementById("residents") ||
    document.querySelector(".residents-layout") ||
    document.querySelector(".residents") ||
    Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).find(isResidentsText) ||
    null;

  const openViaDetails = (anchor?: Element | null): boolean => {
    const det =
      anchor?.closest?.("details") ||
      Array.from(document.querySelectorAll("details")).find((d) =>
        isResidentsText(d.querySelector("summary") || d)
      );

    if (!det) return false;

    const details = det as HTMLDetailsElement;

    // If closed, try clicking the summary first (some custom logic depends on it)
    if (!details.open) {
      const summary = details.querySelector("summary") as HTMLElement | null;
      if (summary) {
        summary.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
        );
      }
      // Also set programmatically to guarantee it's open
      try {
        details.open = true;
        details.setAttribute("open", "");
      } catch {}
    }
    return true;
  };

  const clickCustomToggler = (anchor?: Element | null) => {
    const scope = anchor?.closest?.("*") || document.body;

    // Collect candidates that could act as the disclosure toggle
    const candidates = [
      anchor?.closest?.(
        'summary,button,[role="button"],[data-disclosure-toggle],.disclosure-toggle'
      ) as HTMLElement | null,
      ...Array.from(
        scope.querySelectorAll<HTMLElement>(
          'summary,button,[role="button"],[data-disclosure-toggle],.disclosure-toggle'
        )
      ),
      ...Array.from(
        document.querySelectorAll<HTMLElement>(
          'summary,button,[role="button"],[data-disclosure-toggle],.disclosure-toggle'
        )
      ),
    ].filter(Boolean) as HTMLElement[];

    // Prefer one that actually says "Residents"
    const byText = candidates.find((el) => isResidentsText(el));
    const toggler = byText || candidates[0];

    if (toggler) {
      const expanded = toggler.getAttribute("aria-expanded");
      if (expanded === "false" || expanded == null) {
        toggler.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
        );
        // If it uses aria-expanded, set it to true for good measure.
        try {
          toggler.setAttribute("aria-expanded", "true");
        } catch {}
      }
      return true;
    }
    return false;
  };

  const doScroll = (el: Element) => {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      try {
        window.scrollBy({ top: -72, left: 0, behavior: "auto" }); // compensate sticky header
      } catch {}
    }, 350);
  };

  const tryOnce = () => {
    const anchor = findAnchor();

    // Try opening via <details> first
    const hadDetails = openViaDetails(anchor);

    // If no <details> or still not open, try clicking a custom toggler nearby
    if (!hadDetails) clickCustomToggler(anchor);

    // Resolve the anchor again (in case the DOM changed after opening)
    const target =
      findAnchor() ||
      document.querySelector('details[open] [data-residents-root], details[open] .residents, details[open] .residents-layout');

    if (target) {
      doScroll(target);
      return true;
    }
    return false;
  };

  // Try immediately; then retry while the Disclosure/render settles
  if (tryOnce()) return;
  let tries = 0;
  const id = setInterval(() => {
    if (tryOnce() || ++tries > 20) clearInterval(id);
  }, 100);
}

  const openInline = (mixUrl: string, title: string) => {
    const params = new URLSearchParams(search.toString());
    
    // Extract resident name from title (before " - ")
    const residentName = title.split(' - ')[0];
    // Normalize accented characters before slugifying
    const normalizedResidentName = fold(residentName);
    const residentSlugFromTitle = slugify(normalizedResidentName);
    
    // Use slugFromMixcloudUrl like the archive section does, then normalize
    const rawShowSlug = slugFromMixcloudUrl(mixUrl);
    // Decode URL encoding first, then normalize accented characters
    const decodedSlug = decodeURIComponent(rawShowSlug);
    const showSlug = slugify(fold(decodedSlug));
    
    
    // Set both resident and show parameters like the archive section does
    params.set("r", residentSlugFromTitle);
    params.set("s", showSlug);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    setTimeout(scrollToResidents, 50);
  };

  return (
    <section className="mt-10">
      <h2 className="text-black text-lg font-bold mb-2">Related Shows</h2>

      {loading ? (
        <div className="text-gray-600 mb-4">Loading…</div>
      ) : (
        <>
          {note && <div className="text-gray-600 text-sm mb-4">{note}</div>}

          {items.length > 0 ? (
            <ul className="episodes">
              {items.map((r, idx) => {
                const seps = [" - ", " – ", " — "];
                let splitIdx = -1;
                for (const s of seps) {
                  const i = r.title.lastIndexOf(s);
                  if (i > splitIdx) splitIdx = i;
                }
                const namePart = splitIdx === -1 ? r.title : r.title.slice(0, splitIdx);
                const datePretty = splitIdx === -1 ? "" : r.title.slice(splitIdx + 3).trim();

                return (
                  <li key={`${r.slug}-${idx}`} className="relative group">
                    {/* Artwork: OPEN INLINE ONLY (no footer play here) */}
                    <a
                        href="#"
                        className="block"
                        onClick={(e) => {
                          e.preventDefault();
                          openInline(r.mixUrl, r.title);
                        }}
                        title="Open episode"
                      >
                        {r.imageUrl ? (
                          <img src={r.imageUrl} alt={r.title} className="episode-img" />
                        ) : (
                          <div className="episode-img placeholder" />
                        )}

                        {/* Title / Date (match episode card style) */}
                        <div className="pt-1 text-black text-sm font-bold mb-1 line-clamp-2">{namePart}</div>
                        <div className="text-black text-xs text-gray-600 mb-2 font-akzid">{datePretty}</div>
                      </a>

                      {/* Tags → search (now OUTSIDE the anchor, as BUTTONS) */}
                      {r.tags.length > 0 && (
        <div className="flex gap-2 sm:gap-1 flex-wrap">
                          {r.tags.map((tag) => (
            <button
                              key={`${r.slug}-${tag}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onTagSearch) {
                  onTagSearch(tag, "tag");
                } else {
                  const qs = new URLSearchParams({ q: tag, type: "tag" }).toString();
                  router.push(`/search?${qs}`);
                }
                              }}
                              className="bg-gray-200 text-black text-[9px] px-2 py-1 rounded hover:bg-gray-300 transition-colors duration-200 cursor-pointer font-akzid"
                            >
                              {tag}
            </button>
          ))}
        </div>
                      )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-gray-600">No shows to display right now.</div>
          )}
        </>
      )}

      {/* Match episode card sizing */}
      <style jsx>{`
        .episodes {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }
        .episode-img {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 6px;
          object-fit: cover;
          background: #111;
        }
        .episode-img.placeholder { background: #222; }
      `}</style>
    </section>
  );
}

