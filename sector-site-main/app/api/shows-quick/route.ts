import { NextRequest, NextResponse } from 'next/server';

interface MixcloudShow {
  key: string;
  url: string;
  name: string;
  tags: Array<{ name: string }>;
  created_time: string;
  pictures: {
    large: string;
    medium: string;
    thumbnail: string;
  };
  hosts: Array<{ name: string }>;
  audio_length: number;
}

// Cache variables for quick shows
let cachedQuickShows: MixcloudShow[] = [];
let quickCacheTimestamp = 0;
const QUICK_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

async function fetchQuickShows(): Promise<MixcloudShow[]> {
  try {
    // Fetch only the first 10 shows for immediate display
    const response = await fetch(`https://api.mixcloud.com/sectorfm/cloudcasts/?limit=10&offset=0`);
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.data || [];
    
  } catch (error) {
    console.error('❌ Error fetching quick shows:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const now = Date.now();
    
    // Check if cache is valid (within cache duration)
    if (cachedQuickShows.length > 0 && (now - quickCacheTimestamp) < QUICK_CACHE_DURATION) {
      return NextResponse.json({
        data: cachedQuickShows,
        cached: true,
        cacheAge: now - quickCacheTimestamp,
        totalShows: cachedQuickShows.length
      });
    }
    
    // Cache is expired or empty, fetch fresh data
    const freshShows = await fetchQuickShows();
    
    // Update cache
    cachedQuickShows = freshShows;
    quickCacheTimestamp = now;
    
    return NextResponse.json({
      data: cachedQuickShows,
      cached: false,
      cacheAge: 0,
      totalShows: cachedQuickShows.length
    });
    
  } catch (error) {
    console.error('❌ Error in shows-quick API:', error);
    
    // If we have stale cache data, return it with error flag
    if (cachedQuickShows.length > 0) {
      return NextResponse.json({
        data: cachedQuickShows,
        cached: true,
        error: 'Failed to fetch fresh data, serving stale cache',
        totalShows: cachedQuickShows.length
      });
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch quick shows',
        data: [],
        totalShows: 0
      },
      { status: 500 }
    );
  }
}
