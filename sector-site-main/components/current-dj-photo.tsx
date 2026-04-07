'use client';

import { useEffect, useMemo, useState } from 'react';

type ImageLike =
  | string
  | null
  | undefined
  | { url?: string; src?: string; path?: string; id?: string; mediaUrl?: string; file?: string; filename?: string }
  | ImageLike[]; // sometimes arrays happen

type Resident = {
  title: string;
  image?: ImageLike;
};

type Props = {
  currentDJ: string;
  className?: string;
  /** Optional: show a placeholder when currentDJ is empty / Off Air / Loading… */
  showWhenEmpty?: boolean;
  /** Optional: placeholder image URL to render when showWhenEmpty is true */
  placeholderUrl?: string;
};

const KQL_BODY = {
  query: "page('residents').children",
  select: {
    image: true,            // may be string/object/array depending on your Kirby setup
    title: 'page.title',
  },
};

function normalizeName(s: string) {
  return (s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Robust normalizer: supports absolute URLs, site-absolute, media/, and Kirby-style relative paths
function toAbsoluteImageUrl(input: ImageLike): string | null {
  if (!input) return null;

  // If array, return the first resolvable entry
  if (Array.isArray(input)) {
    for (const item of input) {
      const u = toAbsoluteImageUrl(item);
      if (u) return u;
    }
    return null;
  }

  // If object, try common Kirby/file keys
  if (typeof input === 'object') {
    const obj = input as any;
    const candidate =
      obj.url ?? obj.mediaUrl ?? obj.src ?? obj.path ?? obj.id ?? obj.file ?? obj.filename ?? null;
    return toAbsoluteImageUrl(candidate);
  }

  // From here it's a string
  const s = String(input).trim();
  if (!s) return null;

  // Already absolute?
  if (/^https?:\/\//i.test(s)) return s;

  // Site-absolute path like `/media/pages/...`
  if (s.startsWith('/')) return `https://sector.fm${s}`;

  // Path starting with `media/...`
  if (s.startsWith('media/')) return `https://sector.fm/${s}`;

  // Kirby often returns something like `residents/adia/<hash>/Image.jpg`
  const cleaned = s.replace(/^\/+/, '');
  return `https://sector.fm/media/pages/${cleaned}`;
}

export default function CurrentDJPhoto({
  currentDJ,
  className,
  showWhenEmpty = false,
  placeholderUrl,
}: Props) {
  const [residents, setResidents] = useState<Resident[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setErr(null);

        // Use local proxy in dev to avoid CORS, remote in prod
        const endpoint =
          typeof window !== 'undefined' && window.location.hostname.includes('localhost')
            ? '/api/sector-kql'
            : 'https://sector.fm/api/query';

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(KQL_BODY),
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`Query failed: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();

        // Accept either an array or { result: [...] }
        const list: Resident[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.result)
          ? data.result
          : [];

        if (!cancelled) setResidents(list);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const match = useMemo(() => {
    if (!residents || !currentDJ) return null;

    const want = normalizeName(currentDJ);

    // 1) Exact normalized match
    let found = residents.find((r) => normalizeName(r.title) === want);

    // 2) Fallback: includes match (defensive against minor title differences)
    if (!found) {
      found = residents.find((r) => {
        const t = normalizeName(r.title);
        return t.includes(want) || want.includes(t);
      });
    }

    return found || null;
  }, [residents, currentDJ]);

  const imageUrl = toAbsoluteImageUrl(match?.image);

  const isEmptyState =
    !currentDJ || currentDJ === 'Off Air' || currentDJ === 'Loading...';

  if (isEmptyState) {
    if (!showWhenEmpty) return null;
    return (
      <div className={className}>
        {placeholderUrl ? (
          <img
            src={placeholderUrl}
            alt="Resident placeholder"
            className="w-28 h-28 rounded-xl object-cover shadow-lg"
          />
        ) : (
          <div className="text-white/70 text-sm">No DJ selected.</div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {loading && <div className="text-white/70 text-sm">Loading resident…</div>}
      {err && <div className="text-red-400 text-sm">Error: {err}</div>}

      {imageUrl ? (
        <img
          src={imageUrl}
          alt={match?.title || currentDJ}
          className="w-28 h-28 rounded-xl object-cover shadow-lg"
        />
      ) : (
        !loading &&
        !err && (
          <div className="text-white/70 text-sm">
            No photo found for <span className="font-semibold">{currentDJ}</span>.
          </div>
        )
      )}
    </div>
  );
}
