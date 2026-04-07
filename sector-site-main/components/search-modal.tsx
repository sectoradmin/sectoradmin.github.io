'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SearchSuggestion {
  type: 'dj' | 'tag';
  value: string;
  count: number;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch?: (query: string, type: string) => void;
}

export default function SearchModal({ isOpen, onClose, onSearch }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [allSuggestions, setAllSuggestions] = useState<SearchSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all SECTOR.FM shows to build suggestions
  useEffect(() => {
    if (isOpen && allSuggestions.length === 0) {
      // Add a small delay to avoid blocking the modal opening animation
      const timer = setTimeout(() => {
        fetchAllSuggestions();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, allSuggestions.length]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Filter suggestions based on query
  useEffect(() => {
    if (query.trim() === '') {
      setSuggestions([]);
      setSelectedIndex(-1);
      return;
    }

    const filtered = allSuggestions
      .filter(suggestion => 
        suggestion.value.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 8) // Limit to 8 suggestions
      .sort((a, b) => {
        // Sort by relevance: exact matches first, then by count
        const aExact = a.value.toLowerCase().startsWith(query.toLowerCase());
        const bExact = b.value.toLowerCase().startsWith(query.toLowerCase());
        
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        return b.count - a.count;
      });

    setSuggestions(filtered);
    setSelectedIndex(-1);
  }, [query, allSuggestions]);

  const fetchAllSuggestions = async () => {
    if (isLoading) return; // Prevent multiple simultaneous requests
    
    setIsLoading(true);
    try {
      // Fetch from our optimized search cache endpoint
      const response = await fetch('/api/search-cache', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Search cache failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Validate the response structure
      if (data && Array.isArray(data.suggestions)) {
        setAllSuggestions(data.suggestions);
        console.log(`✅ Loaded ${data.suggestions.length} search suggestions from ${data.cached ? 'cache' : 'fresh data'}`);
      } else {
        throw new Error('Invalid response structure from search cache');
      }
      
    } catch (error) {
      console.error('Error fetching search cache:', error);
      
      // Fallback to shows-cache with client-side processing
      try {
        console.log('🔄 Falling back to shows-cache...');
        const fallbackResponse = await fetch('/api/shows-cache', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const allShows = fallbackData.data || [];

          if (Array.isArray(allShows) && allShows.length > 0) {
            // Quick processing as fallback
            const djCounts: { [key: string]: number } = {};
            const tagCounts: { [key: string]: number } = {};

            allShows.forEach(show => {
              try {
                const titleParts = show.name?.split(' - ') || [];
                if (titleParts.length > 1) {
                  const djName = titleParts[0]?.trim();
                  if (djName) {
                    djCounts[djName] = (djCounts[djName] || 0) + 1;
                  }
                }

                if (Array.isArray(show.tags)) {
                  show.tags.forEach((tag: any) => {
                    const tagName = tag?.name?.trim();
                    if (tagName) {
                      tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
                    }
                  });
                }
              } catch (showError) {
                console.warn('Error processing show:', show, showError);
              }
            });

            const djSuggestions: SearchSuggestion[] = Object.entries(djCounts)
              .map(([dj, count]) => ({ type: 'dj' as const, value: dj, count }));

            const tagSuggestions: SearchSuggestion[] = Object.entries(tagCounts)
              .map(([tag, count]) => ({ type: 'tag' as const, value: tag, count }));

            setAllSuggestions([...djSuggestions, ...tagSuggestions]);
            console.log(`✅ Fallback suggestions loaded: ${djSuggestions.length} DJs, ${tagSuggestions.length} tags`);
          } else {
            console.warn('No valid shows data from fallback');
            setAllSuggestions([]);
          }
        } else {
          throw new Error(`Fallback failed: ${fallbackResponse.status}`);
        }
      } catch (fallbackError) {
        console.error('❌ Both search-cache and fallback failed:', fallbackError);
        setAllSuggestions([]); // Set empty array so search still works for direct queries
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedIndex(prev => 
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions.length > 0 && selectedIndex >= 0) {
          // Select highlighted suggestion
          selectSuggestion(suggestions[selectedIndex]);
        } else if (query.trim()) {
          // Search for the typed query (works even without suggestions)
          performSearch(query, 'all');
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  };

  const selectSuggestion = (suggestion: SearchSuggestion) => {
    performSearch(suggestion.value, suggestion.type);
  };

  const performSearch = (searchQuery: string, searchType: string) => {
    if (onSearch) {
      // Use the new search function from main app
      onSearch(searchQuery, searchType);
    } else {
      // Fallback to old behavior for backward compatibility
      const params = new URLSearchParams({
        q: searchQuery,
        type: searchType
      });
      
      window.location.href = `/search?${params.toString()}`;
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-black border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Search Header */}
        <div className="flex items-center gap-2 sm:gap-4 p-4 sm:p-6 border-b border-gray-700 flex-shrink-0">
          <Search className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for DJs or tags..."
            className="flex-1 bg-transparent text-white text-lg sm:text-xl placeholder-gray-400 outline-none"
          />
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Search Suggestions */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 sm:p-6 text-center text-gray-400 text-sm sm:text-base">
              Loading up the archive...
            </div>
          ) : suggestions.length > 0 ? (
            <div className="py-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.value}`}
                  onClick={() => selectSuggestion(suggestion)}
                  className={`w-full text-left px-4 sm:px-6 py-3 hover:bg-gray-800 transition-colors ${
                    index === selectedIndex ? 'bg-gray-800' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <span className={`text-xs px-2 py-1 rounded flex-shrink-0 ${
                        suggestion.type === 'dj' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-green-600 text-white'
                      }`}>
                        {suggestion.type === 'dj' ? 'DJ' : 'TAG'}
                      </span>
                      <span className="text-white text-sm sm:text-base truncate">{suggestion.value}</span>
                    </div>
                    <span className="text-gray-400 text-xs sm:text-sm flex-shrink-0">
                      {suggestion.count} show{suggestion.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim() ? (
            <div className="p-4 sm:p-6 text-center text-gray-400 text-sm sm:text-base">
              No suggestions found for "{query}"
            </div>
          ) : (
            <div className="p-4 sm:p-6 text-center text-gray-400 text-sm sm:text-base">
              Start typing to search for DJs or tags...
            </div>
          )}
        </div>

        {/* Search Footer */}
        {query.trim() && (
          <div className="border-t border-gray-700 p-3 sm:p-4 flex-shrink-0">
            <button
              onClick={() => performSearch(query, 'all')}
              className="w-full text-left px-3 sm:px-4 py-2 text-gray-300 hover:text-white transition-colors text-sm sm:text-base"
            >
              Search for "{query}" in all shows
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
