export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const body = await req.json();  // expects { return_url: "https://..." }

  const FUNCTIONS_BASE = "https://us-central1-sectorfmuser.cloudfunctions.net";

  const upstream = await fetch(
    `${FUNCTIONS_BASE}/ext-firestore-stripe-payments-createPortalLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    }
  );

  const ct = upstream.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await upstream.json() : await upstream.text();

  return new Response(
    ct.includes("application/json") ? JSON.stringify(data) : (data as string),
    { status: upstream.status, headers: { "Content-Type": ct.includes("application/json") ? "application/json" : "text/plain" } }
  );
}
