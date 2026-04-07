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

// Cache variables
let cachedShows: MixcloudShow[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

async function fetchAllShows(): Promise<MixcloudShow[]> {
  const limit = 100; // Maximum supported by Mixcloud API
  const maxConcurrentRequests = 3; // Conservative parallel requests
  let allShows: MixcloudShow[] = [];

  try {
    // First, get the first batch to understand total scope
    const initialResponse = await fetch(`https://api.mixcloud.com/sectorfm/cloudcasts/?limit=${limit}&offset=0`);
    
    if (!initialResponse.ok) {
      throw new Error(`API Error: ${initialResponse.status} ${initialResponse.statusText}`);
    }
    
    const initialData = await initialResponse.json();
    allShows = [...initialData.data];
    
    // If there's more data, fetch in parallel batches
    if (initialData.paging?.next) {
      // Create parallel batch requests (up to 9 more batches = 1000 total shows)
      const batchPromises = [];
      for (let i = 1; i < 10; i++) {
        const offset = i * limit;
        
        const batchPromise = fetch(`https://api.mixcloud.com/sectorfm/cloudcasts/?limit=${limit}&offset=${offset}`)
          .then(async (response) => {
            if (!response.ok) {
              return null;
            }
            const data = await response.json();
            return data.data || [];
          })
          .catch(() => null);
        
        batchPromises.push(batchPromise);
        
        // Process in chunks to avoid overwhelming the server
        if (batchPromises.length === maxConcurrentRequests) {
          const batchResults = await Promise.all(batchPromises);
          
          // Add non-null results to allShows
          batchResults.forEach((batch) => {
            if (batch && batch.length > 0) {
              allShows = [...allShows, ...batch];
            }
          });
          
          // Clear for next chunk
          batchPromises.length = 0;
          
          // Small delay between chunks to be API-friendly
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // Process any remaining batches
      if (batchPromises.length > 0) {
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach((batch) => {
          if (batch && batch.length > 0) {
            allShows = [...allShows, ...batch];
          }
        });
      }
    }
    
    return allShows;
    
  } catch (error) {
    console.error('❌ Error fetching shows:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const now = Date.now();
    
    // Check if cache is valid (within cache duration)
    if (cachedShows.length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json({
        data: cachedShows,
        cached: true,
        cacheAge: now - cacheTimestamp,
        totalShows: cachedShows.length
      });
    }
    
    // Cache is expired or empty, fetch fresh data
    const freshShows = await fetchAllShows();
    
    // Update cache
    cachedShows = freshShows;
    cacheTimestamp = now;
    
    return NextResponse.json({
      data: cachedShows,
      cached: false,
      cacheAge: 0,
      totalShows: cachedShows.length
    });
    
  } catch (error) {
    console.error('❌ Error in shows-cache API:', error);
    
    // If we have stale cache data, return it with error flag
    if (cachedShows.length > 0) {
      return NextResponse.json({
        data: cachedShows,
        cached: true,
        error: 'Failed to fetch fresh data, serving stale cache',
        totalShows: cachedShows.length
      });
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch shows',
        data: [],
        totalShows: 0
      },
      { status: 500 }
    );
  }
}
