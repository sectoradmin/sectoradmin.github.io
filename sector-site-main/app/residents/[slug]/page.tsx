"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Star } from "lucide-react";

import { fetchHostEpisodes } from "../../../lib/fetchHostEpisodes";
import MixcloudFooterWidget from "../../../components/mixcloud-footer-widget";
import { useFavorites } from "../../hooks/useFavorites";

// ---------------- utils ----------------
const unslugifyLoose = (slug: string) =>
  slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

type Episode = Awaited<ReturnType<typeof fetchHostEpisodes>>[number];

type MCMeta = {
  tags: string[];
  pictures?: {
    large?: string;
    medium?: string;
    thumbnail?: string;
  };
};

function formatAirDateFromTitle(title: string) {
  const parts = title.split(" - ");
  const datePart = parts[1] || "";
  if (!datePart) return "";
  const clean = datePart.replace(/(\d+)(st|nd|rd|th)/g, "$1");
  const d = new Date(clean);
  if (isNaN(d.getTime())) return datePart; // fallback
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const yy = d.getFullYear().toString().slice(-2);
  return `${m}-${day}-${yy}`;
}

function useMixcloudMeta(episodes: Episode[], maxTags = 3) {
  const [meta, setMeta] = useState<Record<string, MCMeta>>({});

  useEffect(() => {
    let cancelled = false;

    const toApiUrl = (showUrl: string) => {
      try {
        const u = new URL(showUrl);
        return `https://api.mixcloud.com${u.pathname}/`;
      } catch {
        return null;
      }
    };

    async function fetchOne(ep: Episode) {
      if (!ep.showlink) return;
      const api = toApiUrl(ep.showlink);
      if (!api) return;
      try {
        const res = await fetch(api, { cache: "force-cache" });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        setMeta((prev) => ({
          ...prev,
          [ep.slug]: {
            tags: Array.isArray(j.tags)
              ? j.tags.map((t: any) => t?.name).filter(Boolean).slice(0, maxTags)
              : [],
            pictures: j.pictures || undefined,
          },
        }));
      } catch {
        /* ignore */
      }
    }

    const run = async () => {
      const limit = Math.min(8, Math.max(2, episodes.length));
      let i = 0;
      await Promise.all(
        Array.from({ length: limit }).map(async () => {
          while (i < episodes.length && !cancelled) {
            const idx = i++;
            await fetchOne(episodes[idx]);
          }
        })
      );
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [episodes, maxTags]);

  return meta;
}

// --------------- page (client) ---------------
export default function ResidentPage() {
  const { slug } = useParams() as { slug: string };
  const hostGuess = unslugifyLoose(decodeURIComponent(slug));

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [displayName, setDisplayName] = useState(hostGuess);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const data = await fetchHostEpisodes(hostGuess, { concurrency: 6 });
        if (!mounted) return;
        setEpisodes(data);
        setDisplayName(data[0]?.host || hostGuess);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [hostGuess]);

  return (
    <ResidentEpisodesClient
      hostName={displayName}
      episodes={episodes}
      loading={loading}
      error={err}
    />
  );
}

// --------------- client UI ---------------
function ResidentEpisodesClient({
  hostName,
  episodes,
  loading,
  error,
}: {
  hostName: string;
  episodes: Episode[];
  loading: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const { add, removeBySlug, has, slugFromMixcloudUrl } = useFavorites(); // mirror archive usage

  const mcMeta = useMixcloudMeta(episodes);
  const gridEpisodes = useMemo(() => episodes, [episodes]);

  // Re-scan Mixcloud play buttons when the grid changes
  useEffect(() => {
    (window as any).MixcloudButtons?.load?.();
    (window as any).Mixcloud?.load?.();
  }, [gridEpisodes.length]);

  const handleTagClick = (e: React.MouseEvent, tagName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const params = new URLSearchParams({ q: tagName, type: "tag" });
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="bg-black p-4">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-white font-bold text-xl">{hostName}</h1>
        <div className="text-gray-400 text-sm">
          {loading
            ? "Loading…"
            : `${gridEpisodes.length} episode${
                gridEpisodes.length === 1 ? "" : "s"
              }`}
        </div>
      </header>

      {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

      {/* Compact card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {gridEpisodes.map((ep) => {
          const mc = mcMeta[ep.slug];
          const img =
            ep.imageUrl ||
            mc?.pictures?.large ||
            mc?.pictures?.medium ||
            mc?.pictures?.thumbnail ||
            "/Sector IG Logo.png";

          // --- FAVORITES: match Mixcloud cards exactly ---
          // 1) Compute the Mixcloud slug from the URL
          const mixcloudSlug = ep.showlink ? slugFromMixcloudUrl(ep.showlink) : "";

          return (
            <div key={ep.slug} className="relative group">
              {/* Favorite star overlay (same pattern as archive cards) */}
              {ep.showlink && (
                <button
                  aria-label="Favorite"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!ep.showlink) return;
                    const slug = slugFromMixcloudUrl(ep.showlink);
                    has(slug) ? removeBySlug(slug) : add(ep.showlink).catch(console.error);
                  }}
                  className="
                    absolute top-2 right-2 z-20
                    inline-flex items-center justify-center
                    w-9 h-9 sm:w-10 sm:h-10
                    rounded-full bg-black/70 ring-1 ring-white/25
                    hover:bg-black/80 transition
                    leading-none select-none
                  "
                >
                  <Star
                    className={`w-5 h-5 block ${
                      ep.showlink && has(mixcloudSlug) ? "fill-yellow-400 text-yellow-400" : "text-white"
                    }`}
                    strokeWidth={2}
                  />
                </button>
              )}

              {/* Anchor + data-mixcloud-play-button → triggers footer, but no navigation */}
              <a
                href={ep.showlink ?? "#"}
                {...(ep.showlink
                  ? { "data-mixcloud-play-button": ep.showlink }
                  : {})}
                className="block w-full aspect-square mb-2 rounded bg-gray-800 cursor-pointer overflow-hidden"
                onClick={(e) => {
                  if (ep.showlink) {
                    // Only footer play, no navigation
                    e.preventDefault();
                  } else {
                    e.preventDefault();
                    window.location.href = `/shows/${ep.slug}`;
                  }
                }}
              >
                <img
                  src={img}
                  alt={ep.title}
                  className="w-full h-full object-contain rounded"
                  onError={(e) => {
                    const t = e.currentTarget as HTMLImageElement;
                    if (t.src.includes("/Sector%20IG%20Logo.png")) return;
                    t.src = "/Sector IG Logo.png";
                  }}
                />
              </a>

              {/* Title (compact) */}
              <div className="text-white text-sm font-bold mb-1 line-clamp-2">
                {ep.title.split(" - ")[0]}
              </div>

              {/* Date, derived from title */}
              <div className="text-white text-xs text-gray-300 mb-2">
                {formatAirDateFromTitle(ep.title)}
              </div>

              {/* Up to 3 genre tags from Mixcloud meta */}
              <div className="flex gap-2 sm:gap-1 flex-wrap">
                {(mc?.tags || []).slice(0, 3).map((tag) => (
                  <button
                    key={`${ep.slug}-${tag}`}
                    onClick={(e) => handleTagClick(e, tag)}
                    className="bg-[#585555] text-white text-xs px-2 py-1 rounded hover:bg-[#707070] transition-colors duration-200 cursor-pointer"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mixcloud footer widget once per page */}
      <div className="mt-6">
        <MixcloudFooterWidget />
      </div>
    </div>
  );
}
