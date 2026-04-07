'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Star } from "lucide-react";
import { useFavorites } from "../app/hooks/useFavorites";
import React, { Component } from 'react';

/* --- Error boundary to absorb Mixcloud widget DOM conflicts --- */
class MixcloudSafeBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    if (!err.message?.includes("removeChild")) {
      console.error(err);
    }
  }
  componentDidUpdate(_: any, prev: { hasError: boolean }) {
    if (this.state.hasError && !prev.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    return this.props.children;
  }
}

interface MixcloudShow {
  key: string;
  url: string;
  name: string;
  tags: Array<{
    name: string;
  }>;
  created_time: string;
  pictures: {
    large: string;
    medium: string;
    thumbnail: string;
  };
  hosts: Array<{
    name: string;
  }>;
  audio_length: number;
}

interface MixcloudShowsProps {
  onSearchClick?: () => void;
  searchResults?: MixcloudShow[];
  isSearchMode?: boolean;
  searchQuery?: string;
  searchType?: string;
  onClearSearch?: () => void;
  onSearch?: (query: string, type: string) => void;
  isSearchLoading?: boolean;
  allShows?: MixcloudShow[];
  showsLoaded?: boolean;
  quickShows?: MixcloudShow[];
  quickShowsLoaded?: boolean;
  preloadCache?: Map<string, any>;
}


function displayDateFromTitle(title: string): string {

  const seps = [" - ", " – ", " — "]; // hyphen, en dash, em dash with spaces

  let idx = -1;

  for (const s of seps) {

    const i = title.lastIndexOf(s);

    if (i > idx) idx = i;

  }

  if (idx === -1) return "";

  return title.slice(idx + 3).trim();

}

export default function MixcloudShows({ 
  onSearchClick, 
  searchResults = [], 
  isSearchMode = false, 
  searchQuery = '', 
  searchType = 'all',
  onClearSearch,
  onSearch,
  isSearchLoading = false,
  allShows = [],
  showsLoaded = false,
  quickShows = [],
  quickShowsLoaded = false,
  preloadCache = new Map()
}: MixcloudShowsProps) {
  const [shows, setShows] = useState<MixcloudShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleShows, setVisibleShows] = useState<MixcloudShow[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreShows, setHasMoreShows] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { add, removeBySlug, has, slugFromMixcloudUrl } = useFavorites();

  const [signinTipSlug, setSigninTipSlug] = useState<string | null>(null);
  const tipTimerRef = useRef<number | null>(null);

  function showSignInTip(slug: string) {
    setSigninTipSlug(slug);
    if (tipTimerRef.current) window.clearTimeout(tipTimerRef.current);
    tipTimerRef.current = window.setTimeout(() => setSigninTipSlug(null), 1800);
  }

  useEffect(() => {
  return () => {
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
  };
}, []);

  useEffect(() => {
    if (showsLoaded && allShows.length > 0) {
      // Use all shows from the full preloaded data
      setShows(allShows);
      // Initialize with first 10 shows
      setVisibleShows(allShows.slice(0, 10));
      setHasMoreShows(allShows.length > 10);
      setLoading(false);
      setError(null);
    } else if (quickShowsLoaded && quickShows.length > 0) {
      // Use quick shows for immediate display while full cache loads
      setShows(quickShows);
      setVisibleShows(quickShows.slice(0, 10));
      setHasMoreShows(quickShows.length > 10);
      setLoading(false);
      setError(null);
    } else if (showsLoaded && allShows.length === 0) {
      // Shows were loaded but no data returned
      setShows([]);
      setVisibleShows([]);
      setError('No shows available');
      setLoading(false);
    }
    // If neither showsLoaded nor quickShowsLoaded, keep loading state
  }, [showsLoaded, allShows, quickShowsLoaded, quickShows]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'numeric', 
      day: 'numeric', 
      year: '2-digit' 
    });
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  const formatAirDate = (dateString: string) => {
    if (!dateString) return '';
    
    try {
      // Parse dates like "27th July, 2025" or "July 27th, 2025" etc.
      // Remove ordinal suffixes (st, nd, rd, th)
      const cleanDateString = dateString.replace(/(\d+)(st|nd|rd|th)/g, '$1');
      
      const date = new Date(cleanDateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return dateString; // Return original if can't parse
      }
      
      const month = date.getMonth() + 1; // getMonth() returns 0-11
      const day = date.getDate();
      const year = date.getFullYear().toString().slice(-2); // Get last 2 digits
      
      return `${month}-${day}-${year}`;
    } catch (error) {
      console.warn('Error formatting date:', dateString, error);
      return dateString; // Return original if error
    }
  };

  const handleTagClick = (e: React.MouseEvent, tagName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (onSearch) {
      onSearch(tagName, 'tag');
    } else {
      const params = new URLSearchParams({ q: tagName, type: 'tag' });
      router.push(`/search?${params.toString()}`);
    }
  };

  // Scroll to residents section and open accordion if closed
  const scrollToResidents = () => {
    // Find the residents disclosure button and click it to open if closed
    const buttons = document.querySelectorAll('button[aria-expanded]');
    let residentsButton = null;
    
    for (const button of buttons) {
      if (button.textContent?.includes('Residents')) {
        residentsButton = button;
        break;
      }
    }
    
    if (residentsButton) {
      const isExpanded = residentsButton.getAttribute('aria-expanded') === 'true';
      if (!isExpanded) {
        // Click the button to open the disclosure
        (residentsButton as HTMLButtonElement).click();
      }
    }
    
    // Find the residents section to scroll to
    const h2Elements = document.querySelectorAll('h2');
    let residentsSection = null;
    
    for (const h2 of h2Elements) {
      if (h2.textContent?.includes('Residents')) {
        residentsSection = h2;
        break;
      }
    }
    
    if (residentsSection) {
      // Small delay to allow the disclosure to open before scrolling
      setTimeout(() => {
        residentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      // Fallback: scroll to top of page
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Open inline resident show
  const openInlineResidentShow = (residentSlug: string, showSlug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("r", residentSlug);
    params.set("s", showSlug);
    
    // Check if we have preloaded data for this show
    const cacheKey = `${residentSlug}-${showSlug}`;
    const preloadedData = preloadCache.get(cacheKey);
    
    if (preloadedData) {
      console.log('Using preloaded data for show:', cacheKey);
      // Store preloaded data in a global cache for the residents layout to use
      if (typeof window !== 'undefined') {
        (window as any).__PRELOADED_SHOW_DATA__ = preloadedData;
      }
    }
    
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    // Allow the UI to update, then scroll to the Residents section
    // Reduce delay on mobile for better responsiveness
    const isMobile = typeof window !== 'undefined' && 
      (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    const scrollDelay = isMobile ? 25 : 50;
    setTimeout(scrollToResidents, scrollDelay);
  };

  // Load more shows function
  const loadMoreShows = () => {
    if (isLoadingMore || !hasMoreShows) return;
    
    setIsLoadingMore(true);
    
    // Simulate a small delay for better UX
    setTimeout(() => {
      const currentLength = visibleShows.length;
      const nextBatch = shows.slice(currentLength, currentLength + 10);
      
      setVisibleShows(prev => [...prev, ...nextBatch]);
      setHasMoreShows(currentLength + 10 < shows.length);
      setIsLoadingMore(false);
    }, 300);
  };

  // Infinite scroll handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 10; // 10px threshold
    
    if (isAtEnd && hasMoreShows && !isLoadingMore) {
      loadMoreShows();
    }
  };

  if (loading) {
    return (
      <div className="bg-white">
        {/* Header with expand/collapse */}
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors duration-200"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h2 className="text-black font-bold text-xl">Archive</h2>
          <div className="text-black">
            {isExpanded ? (
              <ChevronUp className="w-6 h-6" />
            ) : (
              <ChevronDown className="w-6 h-6" />
            )}
          </div>
        </div>
        
        {/* Expandable Content */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].slice(0, 12).map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square bg-gray-700 rounded mb-2"></div>
                  <div className="h-4 bg-gray-700 rounded mb-1"></div>
                  <div className="h-4 bg-gray-700 rounded mb-2"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-700 rounded w-16"></div>
                    <div className="h-6 bg-gray-700 rounded w-20"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white">
        {/* Header with expand/collapse */}
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors duration-200"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h2 className="text-black font-bold text-xl">Archive</h2>
          <div className="text-black">
            {isExpanded ? (
              <ChevronUp className="w-6 h-6" />
            ) : (
              <ChevronDown className="w-6 h-6" />
            )}
          </div>
        </div>
        
        {/* Expandable Content */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-4">
            <div className="text-black text-center py-8">
              <p>Unable to load shows: {error}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Determine which shows to display
  const allDisplayShows = isSearchMode ? searchResults : visibleShows;
  const showCount = isSearchMode ? searchResults.length : shows.length;

  return (
    <MixcloudSafeBoundary>
    <div className="bg-white">
      {/* Header with expand/collapse */}
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors duration-200"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isSearchMode ? (
          <div className="flex-1 min-w-0">
            <h2 className="text-black font-bold text-xl">Search Results</h2>
            <div className="flex items-center gap-2 text-gray-600 text-sm flex-wrap mt-1">
              <span className={`px-2 py-1 rounded text-xs ${
                searchType === 'dj' ? 'bg-blue-600 text-white' : 
                searchType === 'tag' ? 'bg-green-600 text-white' : 'bg-gray-600'
              }`}>
                {searchType === 'dj' ? 'DJ' : searchType === 'tag' ? 'TAG' : 'ALL'}
              </span>
              <span className="font-semibold break-all">"{searchQuery}"</span>
              <span className="text-gray-500">
                {isSearchLoading ? '• Searching...' : `• ${showCount} show${showCount !== 1 ? 's' : ''} found`}
              </span>
            </div>
          </div>
        ) : (
          <h2 className="text-black font-bold text-xl">
            Archive
          </h2>
        )}
        <div className="text-black">
          {isExpanded ? (
            <ChevronUp className="w-6 h-6" />
          ) : (
            <ChevronDown className="w-6 h-6" />
          )}
        </div>
      </div>
      
      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4">
          <h1 className="py-1 text-ns text-gray-600 font-akzid">The Latest from Sector.FM</h1>
      
      <div 
        ref={scrollContainerRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 pt-2"
        onScroll={handleScroll}
      >
        {isSearchLoading ? (
          <div className="flex-shrink-0 w-full text-center py-12">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-xl text-gray-600 mb-2">Searching...</div>
            <div className="text-gray-500">
              Looking for shows matching "{searchQuery}"
            </div>
          </div>
        ) : allDisplayShows.length === 0 && isSearchMode ? (
          <div className="flex-shrink-0 w-full text-center py-12">
            <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <div className="text-xl text-gray-600 mb-2">No shows found</div>
            <div className="text-gray-500">
              Try searching for a different DJ name or tag
            </div>
          </div>
        ) : (
          <>
            {allDisplayShows.map((show: MixcloudShow, index: number) => (
            <div 
              key={show.key} 
              className="relative group flex-shrink-0 w-48 sm:w-52"
            >
              {/* STAR OVERLAY */}
                    <button
                      aria-label="Favorite"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const slug = slugFromMixcloudUrl(show.url);
                        try {
                        has(slug) ? await removeBySlug(slug) : await add(show.url);}
                        catch(err: any){
                          const msg = String(err?.message || err?.code || err).toLowerCase();
                          if (
                            /(not\s*(signed\s*in|authenticated)|unauth|permission|denied|auth)/.test(msg)
                          ) {
                            showSignInTip(slug);
                          } else {
                            console.error('Error adding favorite:', err);
                          }
                        }
                      }}
                      className="
                        absolute top-2 right-2 z-20
                        inline-flex items-center justify-center
                        w-9 h-9 sm:w-9 sm:h-9
                        rounded-full bg-gray-200 ring-1 ring-gray-300
                        hover:bg-gray-300 transition
                        leading-none select-none
                      "
                    >
                      <Star
                        className={`w-5 h-5 block ${
                          has(slugFromMixcloudUrl(show.url))
                            ? "fill-white text-black"
                            : "text-black"
                        }`}
                        strokeWidth={2}
                      />
                    </button>


                  {/* Tiny tooltip (renders only for this card's slug) */}
                  {signinTipSlug === slugFromMixcloudUrl(show.url) && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="absolute top-12 right-2 z-30 px-2 py-1 text-[11px] rounded bg-black text-white shadow-lg border border-black/20 pointer-events-none"
                    >
                      Sign in to favorite
                    </div>
                  )}

            <div
              className="w-full aspect-square mb-2 rounded bg-gray-800 cursor-pointer"
              ref={(el) => {
                if (el) el.setAttribute("data-mixcloud-play-button", show.url);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Extract resident name and create slug
                const residentName = show.name.split(' - ')[0];
                // Normalize accented characters before slugifying
                const normalizedResidentName = residentName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                const residentSlug = normalizedResidentName.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const rawShowSlug = slugFromMixcloudUrl(show.url);
                // Decode URL encoding first, then normalize accented characters
                const decodedSlug = decodeURIComponent(rawShowSlug);
                const showSlug = decodedSlug.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                openInlineResidentShow(residentSlug, showSlug);
              }}
              title="Open episode"
            >
              <img 
                src={show.pictures.large}
                alt={show.name}
                className="w-full h-full object-contain rounded"
                onError={(e) => {
                  // Fallback to medium, then thumbnail, then Sector logo if all fail
                  const target = e.target as HTMLImageElement;
                  const currentSrc = target.src;
                  
                  if (currentSrc.includes(show.pictures.large)) {
                    target.src = show.pictures.medium;
                  } else if (currentSrc.includes(show.pictures.medium)) {
                    target.src = show.pictures.thumbnail;
                  } else if (currentSrc.includes(show.pictures.thumbnail) || !currentSrc.includes('Sector IG Logo.png')) {
                    target.src = '/Sector IG Logo.png';
                    console.log('Using Sector logo fallback for:', show.name);
                  }
                }}
                onLoad={(e) => {
                  // Check if this is the default Mixcloud profile image and replace it
                  const target = e.target as HTMLImageElement;
                  const currentSrc = target.src;
                  
                  if (currentSrc.includes('profile/a/9/b/a/4b44-a3a4-438b-9133-61880d0f0b97')) {
                    target.src = '/Sector IG Logo.png';
                    console.log('Replaced default Mixcloud profile image for:', show.name);
                  }
                }}
              />
            </div>

            
            <div className="text-black text-sm font-bold mb-1 line-clamp-2">
              <a
                href="#"
                className="hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Extract resident name and create slug
                  const residentName = show.name.split(' - ')[0];
                  // Normalize accented characters before slugifying
                  const normalizedResidentName = residentName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                  const residentSlug = normalizedResidentName.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                  const rawShowSlug = slugFromMixcloudUrl(show.url);
                  // Decode URL encoding first, then normalize accented characters
                  const decodedSlug = decodeURIComponent(rawShowSlug);
                  const showSlug = decodedSlug.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                  openInlineResidentShow(residentSlug, showSlug);
                }}
                title="Open episode"
              >
                {show.name.split(' - ')[0]}
              </a>
            </div>
            
            <div className="text-black text-xs text-gray-600 mb-2 font-akzid">
              {displayDateFromTitle(show.name)}
            </div>
            
            <div className="flex gap-2 sm:gap-1 flex-wrap">
              {show.tags.slice(0, 3).map((tag: { name: string }, tagIndex: number) => (
                <button
                  key={tagIndex} 
                  onClick={(e) => handleTagClick(e, tag.name)}
                  className="bg-gray-200 text-black text-[9px] px-2 py-1 rounded hover:bg-gray-300 transition-colors duration-200 cursor-pointer font-akzid"
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        
        {/* Loading indicator for infinite scroll */}
        {!isSearchMode && isLoadingMore && (
          <div className="flex-shrink-0 flex items-center justify-center w-32">
            <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        </>
        )}
      </div>
      
        </div>
      )}
    </div>
    </MixcloudSafeBoundary>
  );
}
