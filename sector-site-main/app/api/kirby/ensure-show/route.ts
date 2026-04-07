export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Body: { url: string; slug: string; title?: string }
 * - Looks for an existing Show by its Mixcloud "Showlink" (url)
 * - If missing, creates it with { slug, showlink, url }
 * - Never blocks the client: always returns 200 with { ok: true/false }
 *
 * Adjust the two fetch() endpoints/payloads to match your Kirby routes.
 * Example assumes:
 *   GET  `${KIRBY_API_BASE}/shows?showlink=<url>` → 200 with JSON (array or object) if found, 404/empty if not
 *   POST `${KIRBY_API_BASE}/shows`                → create { slug, title, showlink, url }
 */

type Body = { url: string; slug: string; title?: string };

const KIRBY_API_BASE =
  process.env.KIRBY_API_BASE || "https://sector.fm/api"; // set in .env.local if different

async function findByShowlink(showlink: string) {
  try {
    const r = await fetch(
      `${KIRBY_API_BASE}/shows?showlink=${encodeURIComponent(showlink)}`
    );
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    if (!data) return null;
    // Normalize: API may return a single object or an array
    return Array.isArray(data) ? (data[0] ?? null) : data;
  } catch {
    return null;
  }
}

async function createShow({ slug, url, title }: { slug: string; url: string; title?: string }) {
  // Adjust payload keys to whatever your Kirby endpoint expects
  const payload = {
    slug,
    title: title || slug.replace(/-/g, " "),
    showlink: url,                         // Mixcloud URL
    url: `https://sector.fm/shows/${slug}` // onsite show URL
  };

  // If your Kirby endpoint expects form-encoded instead of JSON, swap to FormData.
  const r = await fetch(`${KIRBY_API_BASE}/shows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Kirby create failed: ${r.status} ${txt}`);
  }
  return r.json().catch(() => ({}));
}

export async function POST(req: Request) {
  try {
    const { url, slug, title }: Body = await req.json();

    if (!url || !slug) {
      return new Response(JSON.stringify({ ok: false, error: "Missing url or slug" }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    const existing = await findByShowlink(url);
    if (!existing) {
      try {
        await createShow({ slug, url, title });
      } catch (e: any) {
        // Best-effort: don’t block favorites if Kirby create fails
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, slug }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    // Best-effort: never break the client flow
    return new Response(JSON.stringify({ ok: false, error: e.message || "unknown" }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  }
}
