import { NextRequest, NextResponse } from 'next/server';

interface SearchSuggestion {
  type: 'dj' | 'tag';
  value: string;
  count: number;
}

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

interface SearchCacheData {
  suggestions: SearchSuggestion[];
  djCounts: { [key: string]: number };
  tagCounts: { [key: string]: number };
  totalShows: number;
  lastUpdated: number;
}

// Cache variables
let searchCache: SearchCacheData | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes - longer than shows cache

async function fetchShowsFromMixcloud(): Promise<MixcloudShow[]> {
  const limit = 100;
  let allShows: MixcloudShow[] = [];

  try {
    // First batch
    const initialResponse = await fetch(`https://api.mixcloud.com/sectorfm/cloudcasts/?limit=${limit}&offset=0`);
    
    if (!initialResponse.ok) {
      throw new Error(`Mixcloud API Error: ${initialResponse.status} ${initialResponse.statusText}`);
    }
    
    const initialData = await initialResponse.json();
    allShows = [...initialData.data];
    
    // Fetch additional batches if needed (up to 500 shows for search cache)
    if (initialData.paging?.next) {
      const additionalBatches = 4; // 500 total shows should be enough for search
      const batchPromises = [];
      
      for (let i = 1; i <= additionalBatches; i++) {
        const offset = i * limit;
        const batchPromise = fetch(`https://api.mixcloud.com/sectorfm/cloudcasts/?limit=${limit}&offset=${offset}`)
          .then(async (response) => {
            if (!response.ok) return [];
            const data = await response.json();
            return data.data || [];
          })
          .catch(() => []);
        
        batchPromises.push(batchPromise);
      }
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((batch) => {
        if (batch.length > 0) {
          allShows = [...allShows, ...batch];
        }
      });
    }
    
    return allShows;
    
  } catch (error) {
    console.error('Error fetching shows from Mixcloud:', error);
    throw error;
  }
}

function processSearchData(shows: MixcloudShow[]): SearchCacheData {
  const djCounts: { [key: string]: number } = {};
  const tagCounts: { [key: string]: number } = {};

  // Process all shows to extract DJs and tags
  shows.forEach(show => {
    // Extract DJ name from show title (before " - ")
    const titleParts = show.name.split(' - ');
    if (titleParts.length > 1) {
      const djName = titleParts[0].trim();
      if (djName) {
        djCounts[djName] = (djCounts[djName] || 0) + 1;
      }
    }

    // Extract tags
    show.tags?.forEach((tag: any) => {
      const tagName = tag.name?.trim();
      if (tagName) {
        tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
      }
    });
  });

  // Convert to suggestions array and sort by popularity
  const djSuggestions: SearchSuggestion[] = Object.entries(djCounts)
    .map(([dj, count]) => ({ type: 'dj' as const, value: dj, count }))
    .sort((a, b) => b.count - a.count); // Most popular first

  const tagSuggestions: SearchSuggestion[] = Object.entries(tagCounts)
    .map(([tag, count]) => ({ type: 'tag' as const, value: tag, count }))
    .sort((a, b) => b.count - a.count); // Most popular first

  // Combine and create final suggestions array
  const suggestions = [...djSuggestions, ...tagSuggestions];

  return {
    suggestions,
    djCounts,
    tagCounts,
    totalShows: shows.length,
    lastUpdated: Date.now()
  };
}

export async function GET(request: NextRequest) {
  try {
    const now = Date.now();
    
    // Check if cache is valid
    if (searchCache && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json({
        ...searchCache,
        cached: true,
        cacheAge: now - cacheTimestamp
      });
    }
    
    console.log('🔄 Refreshing search cache...');
    
    // Fetch fresh show data
    const shows = await fetchShowsFromMixcloud();
    
    // Process the data for search optimization
    const processedData = processSearchData(shows);
    
    // Update cache
    searchCache = processedData;
    cacheTimestamp = now;
    
    console.log(`✅ Search cache updated: ${processedData.suggestions.length} suggestions, ${processedData.totalShows} shows`);
    
    return NextResponse.json({
      ...searchCache,
      cached: false,
      cacheAge: 0
    });
    
  } catch (error) {
    console.error('❌ Error in search-cache API:', error);
    
    // If we have stale cache data, return it with error flag
    if (searchCache) {
      return NextResponse.json({
        ...searchCache,
        cached: true,
        error: 'Failed to fetch fresh data, serving stale cache',
        cacheAge: Date.now() - cacheTimestamp
      });
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to build search cache',
        suggestions: [],
        djCounts: {},
        tagCounts: {},
        totalShows: 0,
        lastUpdated: 0
      },
      { status: 500 }
    );
  }
}

// Optional: Add a POST endpoint to manually refresh the cache
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Manual search cache refresh requested...');
    
    // Force refresh by clearing cache
    searchCache = null;
    cacheTimestamp = 0;
    
    // Fetch fresh data
    const shows = await fetchShowsFromMixcloud();
    const processedData = processSearchData(shows);
    
    // Update cache
    searchCache = processedData;
    cacheTimestamp = Date.now();
    
    console.log(`✅ Search cache manually refreshed: ${processedData.suggestions.length} suggestions`);
    
    return NextResponse.json({
      success: true,
      message: 'Search cache refreshed',
      ...searchCache,
      cached: false,
      cacheAge: 0
    });
    
  } catch (error) {
    console.error('❌ Error manually refreshing search cache:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to refresh search cache',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
