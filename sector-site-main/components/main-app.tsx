'use client';

import { useState, useEffect, useRef, Suspense, Component } from 'react';
import React from 'react';
import Image from "next/image"
import { Mail, Instagram, Search, MessagesSquare } from 'lucide-react'
import { useRouter } from 'next/navigation'
import MixcloudShows from "./mixcloud-shows"
import LiveDateTime from "./live-datetime"
import LivePlayer from "./live-player"
import SearchModal from "./search-modal"
import LiveSchedule from "./live-schedule"
import MixcloudFooterWidget from "./mixcloud-footer-widget"
import { Disclosure } from "./disclosure"
import ResidentsLayout from './residents-layout';
import LoginLayout from './login-layout';
import EventsLayout from './events-layout';
import Slideshow from './sector-slideshow';
import { Slide } from 'react-slideshow-image';

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

export default function MainApp() {
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [cachedShows, setCachedShows] = useState<any[]>([]);
  const [showsLoaded, setShowsLoaded] = useState(false);
  const [quickShows, setQuickShows] = useState<any[]>([]);
  const [quickShowsLoaded, setQuickShowsLoaded] = useState(false);
  
  // Preload cache for show details and host episodes
  const [preloadCache, setPreloadCache] = useState<Map<string, any>>(new Map());
  const archiveRef = useRef<HTMLDivElement>(null);

  // Preload function for show data (optimized for mobile)
  const preloadShowData = async (shows: any[]) => {
    const newCache = new Map(preloadCache);
    
    // Detect mobile device
    const isMobile = typeof window !== 'undefined' && 
      (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    
    // Reduce preload count on mobile to save bandwidth and memory
    const preloadCount = isMobile ? 5 : 10;
    const showsToPreload = shows.slice(0, preloadCount);
    
    // On mobile, preload sequentially to avoid overwhelming the connection
    if (isMobile) {
      for (const show of showsToPreload) {
        try {
          const residentName = show.name.split(' - ')[0];
          const normalizedResidentName = residentName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const residentSlug = normalizedResidentName.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          
          const rawShowSlug = show.url.split('/').pop() || '';
          const decodedSlug = decodeURIComponent(rawShowSlug);
          const showSlug = decodedSlug.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          
          const cacheKey = `${residentSlug}-${showSlug}`;
          
          // Only preload if not already cached
          if (!newCache.has(cacheKey)) {
            // On mobile, only preload show details (skip host episodes to save bandwidth)
            const showDetails = await fetch(`/api/sector-kql?query=page('shows/${showSlug}')`)
              .then(r => r.json())
              .catch(() => null);
            
            newCache.set(cacheKey, {
              showDetails,
              hostEpisodes: null, // Will be loaded on demand
              residentSlug,
              showSlug,
              preloadedAt: Date.now()
            });
            
            // Small delay between requests on mobile to avoid overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.warn('Failed to preload show data:', error);
        }
      }
    } else {
      // Desktop: preload in parallel as before
      const preloadPromises = showsToPreload.map(async (show) => {
        try {
          const residentName = show.name.split(' - ')[0];
          const normalizedResidentName = residentName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const residentSlug = normalizedResidentName.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          
          const rawShowSlug = show.url.split('/').pop() || '';
          const decodedSlug = decodeURIComponent(rawShowSlug);
          const showSlug = decodedSlug.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          
          const cacheKey = `${residentSlug}-${showSlug}`;
          
          // Only preload if not already cached
          if (!newCache.has(cacheKey)) {
            // Preload show details and host episodes in parallel
            const [showDetails, hostEpisodes] = await Promise.all([
              fetch(`/api/sector-kql?query=page('shows/${showSlug}')`).then(r => r.json()).catch(() => null),
              fetch(`/api/sector-kql?query=page('residents').children.filterBy('title','*=','${residentName}').first`).then(r => r.json()).catch(() => null)
            ]);
            
            newCache.set(cacheKey, {
              showDetails,
              hostEpisodes,
              residentSlug,
              showSlug,
              preloadedAt: Date.now()
            });
          }
        } catch (error) {
          console.warn('Failed to preload show data:', error);
        }
      });
      
      // Wait for all preloads to complete
      await Promise.allSettled(preloadPromises);
    }
    
    setPreloadCache(newCache);
  };

  // Load quick shows immediately, then full cache in background
  useEffect(() => {
    const loadShows = async () => {
      try {
        // First, load quick shows for immediate display
        console.log('Loading quick shows for immediate display...');
        const quickResponse = await fetch('/api/shows-quick');
        
        if (quickResponse.ok) {
          const quickData = await quickResponse.json();
          const quickShowsData = quickData.data || [];
          setQuickShows(quickShowsData);
          setQuickShowsLoaded(true);
          console.log(`✅ Loaded ${quickShowsData.length} quick shows for immediate display`);
        }

        // Then, load full cache in background
        console.log('Preloading full shows data in background...');
        const response = await fetch('/api/shows-cache');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch cached shows: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const allShows = data.data || [];
        
        setCachedShows(allShows);
        setShowsLoaded(true);
        console.log(`✅ Preloaded ${allShows.length} shows for instant search`);
        
        // Expose cached shows to global window for residents layout to access
        if (typeof window !== 'undefined') {
          (window as any).__MAIN_APP_CACHED_SHOWS__ = allShows;
        }
        
      } catch (err) {
        console.error('Error preloading shows:', err);
        setShowsLoaded(false);
      }
    };

    loadShows();
  }, []);

  const handleSearch = async (query: string, type: string) => {
    if (!query.trim()) {
      setIsSearchMode(false);
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    setSearchQuery(query);
    setSearchType(type);
    setIsSearchMode(true);
    setIsSearchLoading(true);

    // Scroll to archive section when searching
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        archiveRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
      });
    });

    try {
      let allShows = cachedShows;
      
      // If full shows aren't preloaded yet, use quick shows if available, otherwise fetch
      if (!showsLoaded || allShows.length === 0) {
        if (quickShowsLoaded && quickShows.length > 0) {
          console.log('Using quick shows for search while full cache loads...');
          allShows = quickShows;
        } else {
          console.log('Shows not preloaded, fetching now...');
          const response = await fetch('/api/shows-cache');
          
          if (!response.ok) {
            throw new Error(`Failed to fetch cached shows: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          allShows = data.data || [];
          setCachedShows(allShows);
          setShowsLoaded(true);
          
          // Expose cached shows to global window for residents layout to access
          if (typeof window !== 'undefined') {
            (window as any).__MAIN_APP_CACHED_SHOWS__ = allShows;
          }
        }
      } else {
        console.log('Using preloaded shows for instant search');
      }

      // Check for exact DJ match first (for DJ searches)
      if (type === 'dj') {
        const searchQueryLower = query.toLowerCase().trim();
        const exactMatch = allShows.find((show: any) => {
          const djName = show.name.split(' - ')[0]?.toLowerCase() || '';
          return djName === searchQueryLower;
        });
        
        if (exactMatch) {
          // Navigate to the DJ's resident page
          const djName = exactMatch.name.split(' - ')[0];
          const normalizedDjName = djName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const djSlug = normalizedDjName.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          
          // Clear search and navigate to resident page
          setIsSearchMode(false);
          setSearchResults([]);
          setIsSearchLoading(false);
          
          // Navigate to resident page
          const params = new URLSearchParams();
          params.set("r", djSlug);
          router.push(`/?${params.toString()}`);
          
          // Scroll to residents section after navigation
          setTimeout(() => {
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
              residentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              // Fallback: scroll to top
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }, 100);
          
          return;
        }
      }

      // Filter shows based on search criteria
      const filteredShows = allShows.filter((show: any) => {
        const showName = show.name.toLowerCase();
        const searchQueryLower = query.toLowerCase();
        
        switch (type) {
          case 'dj':
            // Search in DJ name (before " - ")
            const djName = show.name.split(' - ')[0]?.toLowerCase() || '';
            return djName.includes(searchQueryLower);
            
          case 'tag':
            // Search in tags
            return show.tags.some((tag: any) => 
              tag.name.toLowerCase().includes(searchQueryLower)
            );
            
          case 'all':
          default:
            // Search in both DJ name and tags
            const djMatch = show.name.split(' - ')[0]?.toLowerCase().includes(searchQueryLower);
            const tagMatch = show.tags.some((tag: any) => 
              tag.name.toLowerCase().includes(searchQueryLower)
            );
            return djMatch || tagMatch;
        }
      });

      // Add a small delay to show the loading state, but much faster since data is preloaded
      // Reduce delay on mobile for better responsiveness
      const isMobile = typeof window !== 'undefined' && 
        (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
      const delay = showsLoaded ? (isMobile ? 50 : 100) : (isMobile ? 200 : 500);
      
      setTimeout(() => {
        setSearchResults(filteredShows);
        setIsSearchLoading(false);
        
        // Start preloading data for search results in the background
        if (filteredShows.length > 0) {
          preloadShowData(filteredShows);
        }
        
      }, delay);
      
    } catch (err) {
      console.error('Error searching shows:', err);
      setSearchResults([]);
      setIsSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setIsSearchMode(false);
    setSearchResults([]);
    setSearchQuery('');
    setSearchType('all');
    setIsSearchLoading(false);
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="flex items-center justify-center p-4 bg-black relative">
        {/* Logo - Left Side */}
        <div className="absolute left-4 flex items-center">
          <div 
            className="w-12 h-12 sm:w-16 sm:h-16 mr-2 sm:mr-4 cursor-pointer hover:opacity-80 transition-opacity duration-200"
            onClick={() => {
              if (isSearchMode) {
                clearSearch();
              } else {
                router.push('/');
              }
            }}
          >
            <Image src="/logo.png" alt="SECTOR.FM Logo" width={64} height={64} className="w-full h-full object-contain" />
          </div> 
          <span 
            className="hidden sm:inline text-white font-bold text-lg cursor-pointer hover:text-gray-300 transition-colors duration-200"
            onClick={() => {
              if (isSearchMode) {
                clearSearch();
              } else {
                router.push('/');
              }
            }}
          >
            SECTOR.FM
          </span>
          {/* <span className="hidden sm:inline text-white font-bold text-lg">SECTOR.FM</span> */}
        </div>

        {/* Date/Time - Centered */}
        <LiveDateTime />

        {/* Search - Right Side */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white font-bold text-sm sm:text-lg hover:text-gray-300 transition-colors duration-200 flex items-center"
        >
          <Search className="w-6 h-6" />
        </button>
      </header>

      {/* Live Section */}
      <LivePlayer />

      {/* Live Schedule */}
      <LiveSchedule />

      {/* Slideshow */}
      <Slideshow images={['https://d2w9rnfcy7mm78.cloudfront.net/38776838/original_5ed6e4dc036b60a9ade1b66641df0359.jpg?1755131995?bc=0', 'https://d2w9rnfcy7mm78.cloudfront.net/38776837/original_b1d76cafd076c50d9e95519a8cfa6dc2.jpg?1755131995?bc=0']} duration={4000} transitionDuration={700}/>

    
      {/* Archive */}
      <MixcloudSafeBoundary>
      <div ref={archiveRef}>
      <MixcloudShows
        onSearchClick={() => setIsSearchOpen(true)}
        searchResults={searchResults}
        isSearchMode={isSearchMode}
        searchQuery={searchQuery}
        searchType={searchType}
        onClearSearch={clearSearch}
        onSearch={handleSearch}
        isSearchLoading={isSearchLoading}
        allShows={cachedShows}
        showsLoaded={showsLoaded}
        quickShows={quickShows}
        quickShowsLoaded={quickShowsLoaded}
        preloadCache={preloadCache}
      />
      </div>
      </MixcloudSafeBoundary>

            <Suspense fallback={<div className="p-4 text-center text-gray-600">Loading residents...</div>}>
              <ResidentsLayout 
                allShows={cachedShows}
                showsLoaded={showsLoaded}
                quickShows={quickShows}
                quickShowsLoaded={quickShowsLoaded}
                onTagSearch={handleSearch}
              />
            </Suspense>

            {/* Events Section */}
            <EventsLayout />

            <div className="bg-white">
              <Disclosure
                          defaultOpen={false}         // start open so it matches current behavior
                          className="[&_svg]:text-black"
                          summary={(
                              <h2 className="text-black font-bold text-xl">Profile</h2>
                          )}
                        >
              <LoginLayout />
              </Disclosure>
            </div>

      {/* Footer with Mixcloud Widget */}
      <footer className="bg-white bottom-0 left-0 right-0 z-50">
        {/* Mixcloud Footer Widget */}
        <div className="relative z-10">
          <MixcloudFooterWidget 
            options={{
              disableHotkeys: false,
              disableUnloadWarning: false,
              hide_artwork: false,
              light: false,
              autoplay: true
            }}
          />
        </div>
        
        
        {/* Bottom Navigation */}
        <nav className="p-6 flex justify-center items-center gap-8 relative z-0">
            <a 
            href="https://discord.gg/59R4JxsPap" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-black hover:text-gray-600 transition-colors duration-200 flex items-center"
            aria-label="Join our Discord chat"
          >
            <MessagesSquare className="w-8 h-8" />
          </a>

          <a 
            href="mailto:admin@sector.fm"
            className="text-black hover:text-gray-600 transition-colors duration-200"
            aria-label="Email us"
          >
            <Mail className="w-8 h-8" />
          </a>

          

          <a 
            href="https://www.instagram.com/sector.fm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-black hover:text-gray-600 transition-colors duration-200"
            aria-label="Follow us on Instagram"
          >
            <Instagram className="w-8 h-8" />
          </a>
        </nav>
        {/* About Section */}
        <div className="px-5 pt-2 flex justify-center items-center gap-8 relative z-0">
          <p className='text-center text-xs'>Sector is an independent radio station founded in the Gulf Coast of Florida.</p>
        </div>
      </footer>

      {/* Search Modal */}
      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)}
        onSearch={handleSearch}
      />
      <>
        <style jsx global>{`
          /* Put the Mixcloud footer above everything else */
          .mixcloud-footer-widget-container {
            z-index: 9999 !important;                /* higher than z-50/z-100 overlays */
            height: 60px;                             /* default */
            position: fixed; left: 0; right: 0; bottom: 0; /* belt + suspenders */
          }
          /* Ensure the iframe itself isn’t masked by descendants */
          .mixcloud-footer-widget-container iframe {
            position: relative;
            z-index: 1;
          }

          /* Optional: respect iOS safe-area so it never hides behind the home bar */
          @supports (padding: max(0px)) {
            .mixcloud-footer-widget-container {
              height: calc(60px + env(safe-area-inset-bottom)) !important;
            }
            body {
              padding-bottom: calc(60px + env(safe-area-inset-bottom)) !important;
            }
          }
        `}</style>
      </>
    </div>
  );
}
