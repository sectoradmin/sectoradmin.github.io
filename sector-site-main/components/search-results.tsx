'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ArrowLeft, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import SearchModal from './search-modal';
import { Star } from "lucide-react";
import { useFavorites } from "../app/hooks/useFavorites";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/['']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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

export default function SearchResults() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  
  const [shows, setShows] = useState<MixcloudShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { add, removeBySlug, has, slugFromMixcloudUrl } = useFavorites();
  const resultsRef = useRef<HTMLDivElement>(null);

  // Get URL parameters and listen for changes
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';
    const urlType = searchParams.get('type') || 'all';
    setQuery(urlQuery);
    setSearchType(urlType);
  }, [searchParams]);

  useEffect(() => {
    if (query) {
      searchShows();
    }
  }, [query, searchType]);

  const searchShows = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch from our cached API endpoint
      const response = await fetch('/api/shows-cache');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch cached shows: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const allShows: MixcloudShow[] = data.data || [];

      // Filter shows based on search criteria
      const filteredShows = allShows.filter(show => {
        const showName = show.name.toLowerCase();
        const searchQuery = query.toLowerCase();
        
        switch (searchType) {
          case 'dj':
            // Search in DJ name (before " - ")
            const djName = show.name.split(' - ')[0]?.toLowerCase() || '';
            return djName.includes(searchQuery);
            
          case 'tag':
            // Search in tags
            return show.tags.some(tag => 
              tag.name.toLowerCase().includes(searchQuery)
            );
            
          case 'all':
          default:
            // Search in both DJ name and tags
            const djMatch = show.name.split(' - ')[0]?.toLowerCase().includes(searchQuery);
            const tagMatch = show.tags.some(tag => 
              tag.name.toLowerCase().includes(searchQuery)
            );
            return djMatch || tagMatch;
        }
      });

      setShows(filteredShows);
      
    } catch (err) {
      console.error('Error searching shows:', err);
      setError('Failed to search shows');
    } finally {
      setLoading(false);
    }
  };

  // Scroll to results when query changes (on navigation)
  useEffect(() => {
    if (query && resultsRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resultsRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
        });
      });
    }
  }, [query]);

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

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  const handleTagClick = (e: React.MouseEvent, tagName: string) => {
    e.stopPropagation(); // Prevent the show click from firing
    const params = new URLSearchParams({
      q: tagName,
      type: 'tag'
    });
    router.push(`/search?${params.toString()}`);
  };

  const getSearchTypeLabel = () => {
    switch (searchType) {
      case 'dj': return 'DJ';
      case 'tag': return 'Tag';
      default: return 'All';
    }
  };

  const goBack = () => {
    router.back();
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="flex items-center justify-between p-3 sm:p-4 bg-black relative">
        {/* Logo - Left Side */}
        <div className="flex items-center flex-shrink-0">
          <div 
            className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 mr-2 sm:mr-4 cursor-pointer hover:opacity-80 transition-opacity duration-200"
            onClick={() => router.push('/')}
          >
            <Image src="/logo.png" alt="SECTOR.FM Logo" width={64} height={64} className="w-full h-full object-contain" />
          </div>
          <span 
            className="hidden sm:inline text-white font-bold text-sm sm:text-lg cursor-pointer hover:text-gray-300 transition-colors duration-200"
            onClick={() => router.push('/')}
          >
            SECTOR.FM
          </span>
        </div>

        {/* Title - Centered */}
        <div className="flex-1 text-center px-2">
          <div className="text-white font-bold text-sm sm:text-base md:text-lg truncate">Search Results</div>
        </div>

        {/* Back Button - Right Side */}
        <button
          onClick={goBack}
          className="text-white font-bold text-xs sm:text-sm md:text-lg hover:text-gray-300 transition-colors duration-200 flex items-center gap-1 sm:gap-2 flex-shrink-0"
        >
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden xs:inline">Back</span>
        </button>
      </header>

      {/* Search Results Header */}
      <div className="bg-white p-4 sm:p-6">
        <div className="max-w-6xl mx-auto px-2 sm:px-0">
          <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4">
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 sm:gap-4 hover:opacity-80 transition-opacity duration-200"
            >
              <Search className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 flex-shrink-0" />
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-black">Search Results</h1>
            </button>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-600 text-sm sm:text-base">Searching for</span>
              <span className={`px-2 py-1 rounded text-xs text-white ${
                searchType === 'dj' ? 'bg-blue-600 text-white' : 
                searchType === 'tag' ? 'bg-green-600 text-white' : 'bg-gray-600'
              }`}>
                {getSearchTypeLabel()}
              </span>
              <span className="font-semibold text-black text-sm sm:text-base break-all">"{query}"</span>
            </div>
            {!loading && (
              <div className="flex items-center justify-between gap-2 min-w-0 font-akzid">
                <span className="text-black text-xs sm:text-sm flex-shrink-0 font-akzid">
                  {shows.length} show{shows.length !== 1 ? 's' : ''} found
                </span>
                <button 
                  onClick={() => {
                    setQuery('');
                    setSearchType('all');
                    router.push('/search');
                  }}
                  className="text-gray-600 hover:text-black text-xs sm:text-sm transition-colors duration-200 flex-shrink-0 whitespace-nowrap"
                >
                  Clear Search
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Results */}
      <div ref={resultsRef} className="p-3 sm:p-4 md:p-6">
        <div className="max-w-6xl mx-auto px-2 sm:px-0">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square bg-gray-700 rounded mb-2"></div>
                  <div className="h-3 sm:h-4 bg-gray-700 rounded mb-1"></div>
                  <div className="h-3 sm:h-4 bg-gray-700 rounded mb-2"></div>
                  <div className="flex gap-1 sm:gap-2">
                    <div className="h-5 sm:h-6 bg-gray-700 rounded w-12 sm:w-16"></div>
                    <div className="h-5 sm:h-6 bg-gray-700 rounded w-16 sm:w-20"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 sm:py-12">
              <div className="text-red-600 text-base sm:text-lg mb-2">Error</div>
              <div className="text-gray-600 text-sm sm:text-base">{error}</div>
            </div>
          ) : shows.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <Search className="w-12 h-12 sm:w-16 sm:h-16 text-gray-600 mx-auto mb-4" />
              <div className="text-lg sm:text-xl text-gray-600 mb-2 font-akzid">No shows found</div>
              <div className="text-gray-600 text-sm sm:text-base">
                Try searching for a different DJ name or tag
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {shows.map((show) => (
                <div 
                  key={show.key} 
                  className="relative group cursor-pointer"
                  onClick={() => window.open(show.url, '_blank')}
                >
                  <button
                        aria-label="Favorite"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const slug = slugFromMixcloudUrl(show.url);
                          has(slug) ? removeBySlug(slug) : add(show.url).catch(console.error);
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

                  <div className="w-full aspect-square mb-2 rounded bg-gray-800 relative">
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
                  
                  <div className="text-black text-xs sm:text-sm font-bold mb-1 line-clamp-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const djName = show.name.split(' - ')[0].trim();
                        router.push(`/?r=${slugify(djName)}`);
                      }}
                      className="hover:underline text-left"
                    >
                      {show.name.split(' - ')[0]}
                    </button>
                  </div>
                  
                  <div className="text-black text-xs text-gray-600 mb-2 font-akzid">
                    {formatAirDate(show.name.split(' - ')[1] || '')}
                  </div>
                  
                  <div className="flex gap-1 sm:gap-2 flex-wrap">
                    {show.tags.slice(0, 3).map((tag, tagIndex) => (
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
            </div>
          )}
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}
