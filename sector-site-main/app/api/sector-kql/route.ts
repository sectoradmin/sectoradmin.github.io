// app/api/sector-kql/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';           // ensure Node runtime (not edge)
export const dynamic = 'force-dynamic';    // avoid caching

export async function OPTIONS() {
  // Allow dev tools / typeahead to ping OPTIONS without errors
  return NextResponse.json({}, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text(); // forward raw body exactly as you sent it

    const upstream = await fetch('https://sector.fm/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // Let the origin handle caching; we’ll expose as-is
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        // pass through type if present, default to json
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Proxy error' },
      { status: 502 },
    );
  }
}
