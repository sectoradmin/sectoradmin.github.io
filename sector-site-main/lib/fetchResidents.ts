// lib/fetchResidents.ts
export interface Resident {
  title: string;
  instagram?: string;
  imageUrl?: string; // normalized absolute URL
}

const ENDPOINT = "https://sector.fm/api/query";
const HOST = "https://sector.fm";
const MEDIA_BASE = `${HOST}/media/pages/`;

// Normalize whatever the API gives us into a usable absolute URL.
function normalizeImageUrl(val: unknown): string | undefined {
  if (!val) return undefined;

  if (typeof val === "object" && val) {
    const o = val as Record<string, unknown>;
    const raw =
      (typeof o.url === "string" && o.url) ||
      (typeof o.link === "string" && o.link) ||
      (typeof o.src === "string" && o.src) ||
      undefined;
    if (raw) return normalizeImageUrl(raw);
  }

  if (typeof val !== "string") return undefined;
  const s = val.trim();
  if (!s) return undefined;

  // Already absolute
  if (/^https?:\/\//i.test(s)) return s;

  // Already a Kirby media path → just prefix host
  if (s.startsWith("/media/pages/")) return `${HOST}${s}`;

  // Root-relative resident path → rewrite to media/pages (cannot invent fingerprint)
  if (s.startsWith("/residents/")) return `${HOST}/media/pages${s}`;

  // Bare resident path like "residents/slug/..." → place under media/pages
  if (s.startsWith("residents/")) return `${MEDIA_BASE}${s.replace(/^\/+/, "")}`;

  // Other root-relative → prefix host
  if (s.startsWith("/")) return `${HOST}${s}`;

  // Fallback: treat as relative under media/pages
  return `${MEDIA_BASE}${s.replace(/^\/+/, "")}`;
}

// Prefer fully-fingerprinted URLs from imageObjs; fall back to your existing `images` shape.
function firstImageUrl(row: any): string | undefined {
  const candidates: string[] = [];

  // 1) Preferred: objects under imageObjs with { url }
  if (Array.isArray(row?.imageObjs)) {
    for (const it of row.imageObjs) {
      if (it && typeof it.url === "string") candidates.push(it.url as string);
    }
  }

  // 2) Back-compat: whatever "images" used to be in your existing code
  const imgs = row?.images;
  if (Array.isArray(imgs)) {
    for (const it of imgs) {
      if (typeof it === "string") candidates.push(it);
      else if (it && typeof (it as any).url === "string") candidates.push((it as any).url as string);
      else if (it && typeof (it as any).src === "string") candidates.push((it as any).src as string);
      else if (it && typeof (it as any).link === "string") candidates.push((it as any).link as string);
    }
  } else if (typeof imgs === "string") {
    candidates.push(imgs);
  } else if (imgs && typeof (imgs as any).url === "string") {
    candidates.push((imgs as any).url as string);
  }

  for (const c of candidates) {
    const nu = normalizeImageUrl(c);
    if (nu) return nu;
  }
  return undefined;
}

export async function fetchResidents(): Promise<Resident[]> {
  // Keep your original fields; add imageObjs with nested select to get final URLs from Kirby.
  const bodyObj = {
    query: "page('residents').children",
    select: {
      images: true, // original shape you were using
      imageObjs: { query: "page.images", select: { url: true } }, // NEW: finished URLs
      instagram: true,
      title: true,
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(bodyObj),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fetchResidents: HTTP ${res.status} ${res.statusText} ${text?.slice(0, 200)}`);
  }

  const json: any = await res.json().catch(() => null);

  // Be tolerant: some KQL setups return an array at result, others nest under result.data
  const rows: any[] =
    (Array.isArray(json?.result) && json.result) ||
    (Array.isArray(json?.result?.data) && json.result.data) ||
    [];

  // Preserve your current UI behavior
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows.map((item: any) => {
    const title =
      typeof item?.title === "string" ? item.title.trim() : String(item?.title ?? "").trim();
    const instagram =
      typeof item?.instagram === "string" && item.instagram.trim()
        ? item.instagram.trim()
        : undefined;

    const imageUrl = firstImageUrl(item);

    return { title, instagram, imageUrl };
  });
}
