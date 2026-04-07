import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const url = searchParams.get('url');

  if (!type) {
    return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });
  }

  if (type === 'image' && !url) {
    return NextResponse.json({ error: 'Missing url parameter for image type' }, { status: 400 });
  }

  try {
    if (type === 'shows') {
      // Proxy the Mixcloud API call
      const response = await fetch('https://api.mixcloud.com/sectorfm/cloudcasts/');
      const data = await response.json();
      
      return NextResponse.json(data);
    } else if (type === 'image') {
      // Proxy the image request
      const imageResponse = await fetch(url);
      
      if (!imageResponse.ok) {
        throw new Error(`Image fetch failed: ${imageResponse.status}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('content-type') || 'image/png';
      
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else {
      return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' }, 
      { status: 500 }
    );
  }
}
