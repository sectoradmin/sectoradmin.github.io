'use client';

import React from 'react';
import { useState, Suspense } from 'react';
import Image from "next/image"
import { Mail, Instagram } from 'lucide-react'
import LiveDateTime from "../../components/live-datetime"
import LivePlayer from "../../components/live-player"
import SearchModal from "../../components/search-modal"
import LiveSchedule from "../../components/live-schedule"
import CurrentTrack from "../../components/current-track"
import MixcloudFooterWidget from "../../components/mixcloud-footer-widget"
import ResidentsLayout from '../../components/residents-layout';
import { useRouter } from 'next/navigation';

export default function ResidentsPage() {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const router = useRouter();
  return (
        <div className="min-h-screen bg-black text-white font-sans">
          {/* Header */}
          <header className="flex items-center justify-center p-4 bg-black relative">
            {/* Logo - Left Side */}
            <div className="absolute left-4 flex items-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 mr-2 sm:mr-4">
                <Image src="/logo.png" alt="SECTOR.FM Logo" width={64} height={64} className="w-full h-full object-contain" />
              </div> 
              <span 
                className="hidden sm:inline text-white font-bold text-lg cursor-pointer hover:text-gray-300 transition-colors duration-200"
                onClick={() => router.push('/')}
              >
                SECTOR.FM
              </span>
              {/* <span className="hidden sm:inline text-white font-bold text-lg">SECTOR.FM</span> */}
            </div>
    
            {/* Date/Time - Centered */}
            <LiveDateTime />
    
            {/* Chat - Right Side */}
            <a 
              href="https://discord.gg/59R4JxsPap" 
              target="_blank" 
              rel="noopener noreferrer"
              className="absolute right-4 text-white font-bold text-sm sm:text-lg hover:text-gray-300 transition-colors duration-200"
            >
              Chat
            </a>
          </header>
    
          {/* Live Section */}
          <div className="relative bg-gradient-to-r from-[#3a7ff5] to-[#4a8ff8] py-6 px-4">
          
    
            <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
              {/* Unified Live Status */}
              <div className="flex items-center space-x-6">
                <LivePlayer />
              </div>
            </div>
          </div>
    
          {/* Now Playing */}
          <CurrentTrack />
    
          {/* Live Schedule */}
          <LiveSchedule />
        
        {/* Residents Layout */}
        <Suspense fallback={<div className="p-4 text-center text-gray-600">Loading residents...</div>}>
          <ResidentsLayout />
        </Suspense>


          {/* Footer with Mixcloud Widget */}
                <footer className="bg-white">
                  {/* Mixcloud Footer Widget */}
                  <MixcloudFooterWidget 
                    options={{
                      disableHotkeys: false,
                      disableUnloadWarning: false,
                      hide_artwork: false,
                      light: false,
                      autoplay: true
                    }}
                  />
                  
                  {/* Bottom Navigation */}
                  <nav className="p-6 flex justify-center items-center gap-8">
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
                </footer>
          
                {/* Search Modal */}
                <SearchModal 
                  isOpen={isSearchOpen} 
                  onClose={() => setIsSearchOpen(false)} 
                />
              </div>
            );

  };
