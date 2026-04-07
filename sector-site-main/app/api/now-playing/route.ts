export async function GET() {
  try {
    const res = await fetch(
      'https://spinitron.com/api/spins?access-token=QtKEbqGbhpTWO_CGIygUAapU&count=1',
      {
        cache: 'no-store', // 🔥 disables Next.js caching
      }
    );

    const data = await res.json();
    const spin = data.items?.[0];

    return new Response(
      JSON.stringify({
        artist: spin?.artist || 'Unknown Artist',
        song: spin?.song || 'Untitled Track',
        id: spin?.id || null,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store', // extra safety
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch Spinitron' }),
      { status: 500 }
    );
  }
}