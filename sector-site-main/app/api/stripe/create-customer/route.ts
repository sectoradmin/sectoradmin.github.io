export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";

  const FUNCTIONS_BASE = "https://us-central1-sectorfmuser.cloudfunctions.net";

  const upstream = await fetch(
    `${FUNCTIONS_BASE}/ext-firestore-stripe-payments-createCustomer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({}),
    }
  );

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
