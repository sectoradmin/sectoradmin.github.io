export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const body = await req.json();

  // Use the project that actually hosts the extension:
  const FUNCTIONS_BASE = "https://us-central1-sectorfmuser.cloudfunctions.net";

  const upstream = await fetch(
    `${FUNCTIONS_BASE}/ext-firestore-stripe-payments-createCheckoutSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    }
  );

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}