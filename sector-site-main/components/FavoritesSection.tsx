"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useFavorites } from "../app/hooks/useFavorites";

/** Shape returned by /api/shows-cache (already used elsewhere) */
type MixcloudShow = {
  key: string;
  url: string;
  name: string;
  pictures: { large: string; medium: string; thumbnail: string };
};

type ShowMeta = {
  title: string;
  image: string;
  url: string;   // mixcloud url
  slug: string;  // kirby show slug
};

/* --- Helpers to align with other episode card UIs --- */
const pickImage = (p?: { large?: string; medium?: string; thumbnail?: string } | null) =>
  p?.large || p?.medium || p?.thumbnail || "/Sector IG Logo.png";

/** Split a full title like "Show Name - 14th September, 2025" into [name, dateTail] */
function splitTitle(title: string): [string, string] {
  const seps = [" - ", " – ", " — "];
  let idx = -1;
  for (const s of seps) {
    const i = title.lastIndexOf(s);
    if (i > idx) idx = i;
  }
  if (idx === -1) return [title, ""];
  return [title.slice(0, idx), title.slice(idx + 3).trim()];
}

/** Fold diacritics, normalize, then make a slug (same spirit as elsewhere) */
function normalizeBasic(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // remove combining marks
}
function slugify(s: string) {
  return normalizeBasic(s)
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Derive a resident slug from the "name" part of the title (strip guests) */
function residentSlugFromNamePart(namePart: string): string {
  let s = namePart;

  // Cut off guests/collabs: "&", "with", "w/", "feat/ft.", "b2b", " x "
  s = s.replace(/\s+(with|w\/|feat\.?|ft\.?|b2b|x)\s+.*$/i, "");
  s = s.split(/\s+&\s+/)[0] || s;

  return slugify(s);
}

/** Smoothly scroll the Residents layout into view and ensure the Disclosure is open */
/** Smoothly scroll the Residents layout into view and FORCE the Disclosure open */
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



export default function FavoritesSection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { items, loading, removeBySlug } = useFavorites();

  // Enriched catalog (Mixcloud name + artwork) from your cached archive
  const [catalog, setCatalog] = useState<Record<string, ShowMeta>>({});
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  // Pagination (keep your current 6 / page or set to 5 if you prefer)
  const ITEMS_PER_PAGE = 6;
  const [page, setPage] = useState(1);

  // A single hidden anchor that Mixcloud’s script will intercept (no nav)
  const playAnchorRef = useRef<HTMLAnchorElement | null>(null);

  // Load the cached archive once, then map by both url and slug
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/shows-cache");
        if (!r.ok) throw new Error("Failed to load shows cache");
        const data = await r.json();
        const shows: MixcloudShow[] = data?.data || [];

        const map = new Map<string, ShowMeta>();
        for (const s of shows) {
          const slug = s.url.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
          const meta: ShowMeta = {
            title: s.name || slug,
            image: pickImage(s.pictures || null),
            url: s.url,
            slug,
          };
          // Map both canonical URL and slug
          map.set(s.url.replace(/\/+$/, ""), meta);
          if (slug) map.set(slug, meta);
        }
        if (!cancelled) {
          setCatalog(Object.fromEntries(map));
          setCatalogLoaded(true);
        }
      } catch {
        // Even if cache fails, we’ll still render using slug + fallback art
        setCatalog({});
        setCatalogLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep Mixcloud buttons “hot” whenever the visible page changes
  useEffect(() => {
    (window as any).MixcloudButtons?.load?.();
    (window as any).Mixcloud?.load?.();
  }, [page, catalogLoaded, loading, items.length]);

  const ordered = useMemo(() => {
    // Newest first by createdAt (if present)
    return [...items].sort(
      (a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
    );
  }, [items]);

  // Reset page if list shrinks
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(ordered.length / ITEMS_PER_PAGE));
    if (page > totalPages) setPage(totalPages);
  }, [ordered.length, page]);

  const totalPages = Math.max(1, Math.ceil(ordered.length / ITEMS_PER_PAGE));
  const sliceStart = (page - 1) * ITEMS_PER_PAGE;
  const visible = ordered.slice(sliceStart, sliceStart + ITEMS_PER_PAGE);

  // Centralized footer-play trigger that NEVER navigates
  const playInFooter = (mixUrl?: string) => {
    if (!mixUrl) return;
    // Make sure Mixcloud’s handlers are ready
    (window as any).MixcloudButtons?.load?.();
    (window as any).Mixcloud?.load?.();

    const a = playAnchorRef.current;
    if (!a) return;
    a.setAttribute("href", mixUrl);
    a.setAttribute("data-mixcloud-play-button", mixUrl);

    // Dispatch a cancelable click; anchor itself prevents default nav
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
    a.dispatchEvent(evt);
  };

  // Navigate to inline resident/show view in the current tab, then scroll it into view
  const openInlineResidentShow = (residentSlug: string, showSlug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("r", residentSlug);
    params.set("s", showSlug);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    // Allow the UI to update, then scroll to the Residents section
    setTimeout(scrollToResidents, 50);
  };

  if (loading || !catalogLoaded) {
    return <div className="bg-white relative">Loading favorites…</div>;
  }

  if (ordered.length === 0) {
    return (
      <div className="bg-white relative">
        <h3 className="text-lg font-semibold mb-3 text-black">Your Favorites</h3>
        <div className="text-gray-700">No favorites yet. Tap the ★ on any episode.</div>
      </div>
    );
  }

  return (
    <div className="bg-white relative">
      <h3 className="text-lg font-semibold mb-3 text-black">Your Favorites</h3>

      {/* Hidden anchor used by Mixcloud’s script; hard-stop navigation */}
      <a
        ref={playAnchorRef}
        href="#"
        onClick={(e) => e.preventDefault()}
        style={{ position: "absolute", left: "-99999px", width: 1, height: 1, overflow: "hidden" }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Card grid (paged) */}
      <ul className="episodes">
        {visible.map((fav: any) => {
          const key = fav.slug || fav.url?.replace(/\/+$/, "");
          const meta = (key && catalog[key]) ||
            catalog[fav.url?.replace(/\/+$/, "")] || {
              title: fav.slug || "Untitled",
              image: "/Sector IG Logo.png",
              url: fav.url,
              slug: fav.slug || "",
            };

          const [namePart, datePretty] = splitTitle(meta.title);
          const residentCandidate = residentSlugFromNamePart(namePart) || "residents";

          return (
            <li key={`${fav.user}_${meta.slug}`} className="relative group">
              {/* Remove button (top-right) */}
              <button
                onClick={() => removeBySlug(meta.slug)}
                className="absolute top-2 right-2 z-20 inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 ring-1 ring-gray-300 hover:bg-gray-300 transition"
                aria-label="Remove favorite"
                title="Remove favorite"
              >
                <Trash2 className="w-4 h-4 text-black" />
              </button>

              {/* Artwork: a button that ONLY triggers the footer (no anchor here) */}
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => playInFooter(meta.url)}
                title="Play episode"
              >
                <div className="episode-img">
                  <img
                    src={meta.image}
                    alt={meta.title}
                    className="w-full h-full object-cover rounded"
                    onError={(e) => {
                      // Fallback cascade
                      const img = e.currentTarget as HTMLImageElement;
                      if (!img.dataset.step) { img.dataset.step = "1"; img.src = meta.image.replace("large", "medium"); return; }
                      if (img.dataset.step === "1") { img.dataset.step = "2"; img.src = meta.image.replace("medium", "thumbnail"); return; }
                      img.src = "/Sector IG Logo.png";
                    }}
                  />
                </div>
              </button>

              {/* Title / Date — clicking title opens nested view in the current tab and scrolls to Residents */}
              <div className="pt-1 text-black text-sm font-bold mb-1 line-clamp-2">
                <a
                  href="#"
                  className="hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openInlineResidentShow(residentCandidate, meta.slug);
                  }}
                  title="Open episode"
                >
                  {namePart}
                </a>
              </div>
              <div className="text-black text-xs text-gray-600 mb-2 font-akzid">{datePretty}</div>
            </li>
          );
        })}
      </ul>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          className="px-3 py-1.5 rounded bg-gray-200 text-black disabled:opacity-50 hover:bg-gray-300 font-akzid"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          Prev
        </button>

        <div className="flex items-center gap-1 text-sm">
          {Array.from({ length: totalPages }).map((_, i) => {
            const n = i + 1;
            const active = n === page;
            return (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-8 h-8 rounded ${active ? "bg-black text-white font-akzid" : "bg-gray-200 text-black hover:bg-gray-300 font-akzid"} transition`}
                aria-current={active ? "page" : undefined}
              >
                {n}
              </button>
            );
          })}
        </div>

        <button
          className="px-3 py-1.5 rounded bg-gray-200 text-black disabled:opacity-50 hover:bg-gray-300 font-akzid"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
        </button>
      </div>

      {/* Sizing/styles identical to your compact episode cards */}
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
          background: #111;
          overflow: hidden;
        }
        .episode-img > img { display: block; width: 100%; height: 100%; object-fit: cover; }
      `}</style>
    </div>
  );
}
