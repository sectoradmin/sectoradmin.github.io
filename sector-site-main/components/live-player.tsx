'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Volume1 } from 'lucide-react';
import { getCurrentAndNextDJ, formatDJDisplay } from '../lib/schedule';
import { IfSubscribed } from './if-subscribed';

export default function LivePlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [currentDJ, setCurrentDJ] = useState<string>('Loading...');
  const [currentTimeSlot, setCurrentTimeSlot] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<string>('Loading...');
  const [isOffAir, setIsOffAir] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    setMounted(true);
    
    const updateSchedule = () => {
      const { current } = getCurrentAndNextDJ();
      if (current) {
        setCurrentDJ(formatDJDisplay(current));
        setCurrentTimeSlot(current.timeSlot);
        setIsOffAir(false);
      } else {
        setCurrentDJ('Off Air');
        setCurrentTimeSlot('');
        setIsOffAir(true);
      }
    };

    // Update immediately
    updateSchedule();
    
    // Listen for schedule updates from the schedule module
    const handleScheduleUpdate = () => {
      console.log('Schedule updated, refreshing live player');
      updateSchedule();
    };
    
    window.addEventListener('schedule:updated', handleScheduleUpdate);
    
    // Update every minute to keep schedule current
    const interval = setInterval(updateSchedule, 60000);
    
    // Also retry a few times in the first 30 seconds to catch initial load
    const retryInterval = setInterval(updateSchedule, 5000);
    const retryTimeout = setTimeout(() => {
      clearInterval(retryInterval);
    }, 30000);
    
    return () => {
      clearInterval(interval);
      clearInterval(retryInterval);
      clearTimeout(retryTimeout);
      window.removeEventListener('schedule:updated', handleScheduleUpdate);
    };
  }, []);

  // Track fetching logic (copied from CurrentTrack component)
 useEffect(() => {
  if (!mounted) return;

  

  const fetchSpinitronTrack = async () => {
  try {
    const res = await fetch('/api/now-playing', {
      cache: 'no-store',
    });

    const data = await res.json();

    if (!data) return 'No track data';

    console.log('Spin ID:', data.id);

    return `${data.artist} – ${data.song}`;
  } catch (err) {
    console.error('Error fetching now playing:', err);
    return 'Unavailable';
  }
};

  const updateNowPlaying = async () => {
    try {
      // Airtime check (keep this)
      const res = await fetch('https://sectorfm.airtime.pro/api/live-info-v2');
      const data = await res.json();

      // Check if we're off air
      const { current } = getCurrentAndNextDJ();
      const isOffAir = !current;
      setIsOffAir(isOffAir);

      if (isOffAir) {
        setCurrentTrack('');
        return;
      }

      // 🔥 Always use Spinitron now
      const trackString = await fetchSpinitronTrack();
      setCurrentTrack(trackString);

    } catch (err) {
      console.error('Error fetching show info:', err);
      setCurrentTrack('Unavailable');
    }
  };

  // Initial run
  updateNowPlaying();

  // Poll every 30s
  const interval = setInterval(updateNowPlaying, 30000);

  return () => clearInterval(interval);
}, [mounted]);


  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleCanPlay = () => {
      console.log('Audio can play');
      setIsLoading(false);
    };
    const handleEnded = () => {
      console.log('Audio ended');
      setIsPlaying(false);
    };
    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      setIsLoading(false);
      setIsPlaying(false);
    };

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.volume = volume;

    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [volume]);

  // Listen for custom events to pause live broadcast when Mixcloud starts playing
  useEffect(() => {
    const handleMixcloudPlay = () => {
      console.log('Received mixcloud-play event, current live player state:', { isPlaying });
      if (isPlaying) {
        console.log('Pausing live broadcast due to Mixcloud playback');
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          setIsPlaying(false);
          console.log('Live broadcast paused successfully');
        }
      } else {
        console.log('Live broadcast is already paused, no action needed');
      }
    };

    console.log('Setting up mixcloud-play event listener');
    window.addEventListener('mixcloud-play', handleMixcloudPlay);
    
    return () => {
      console.log('Cleaning up mixcloud-play event listener');
      window.removeEventListener('mixcloud-play', handleMixcloudPlay);
    };
  }, [isPlaying]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        setIsLoading(true);
        
        // Safety timeout to prevent infinite loading
        const timeout = setTimeout(() => {
          console.warn('Audio loading timeout - resetting loading state');
          setIsLoading(false);
        }, 8000);
        
        try {
          await audio.play();
          clearTimeout(timeout);
          setIsPlaying(true);
          setIsLoading(false);
          
          // Dispatch custom event to pause Mixcloud widget when live broadcast starts
          console.log('Live broadcast started playing, pause Mixcloud widget');
          window.dispatchEvent(new CustomEvent('live-play'));
        } catch (playError) {
          clearTimeout(timeout);
          throw playError;
        }
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsLoading(false);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const getVolumeIcon = () => {
    if (volume === 0) return VolumeX;
    if (volume < 0.5) return Volume1;
    return Volume2;
  };

  const VolumeIcon = getVolumeIcon();


  return (
    <div className="bg-white w-full max-w-full overflow-hidden">
      {/* Mobile View: Play Button + DJ Info + Time + Now Playing with horizontal scroll */}
      <div className="flex items-center gap-2 sm:hidden w-full max-w-full">
        {/* Play Button + DJ Info + Time + Now Playing - All on one line */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className="relative group flex-shrink-0"
          >
            <div className="w-10 h-10 flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-active:scale-95 disabled:opacity-50">
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6 text-black fill-current" />
              ) : (
                <Play className="w-6 h-6 text-black fill-current" />
              )}
            </div>
          </button>

          {/* DJ Name, Time, and Now Playing - Inline with motion banner */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2 whitespace-nowrap animate-scroll-infinite">
              <div className="text-black font-semibold text-lg">
                {mounted ? currentDJ : 'Loading...'}
              </div>
              <div className="text-black/70 text-s">
                {mounted ? currentTimeSlot : ''}
              </div>
              <IfSubscribed>
                <div className="text-black text-sm">
                  {!isOffAir && currentTrack ? `Now Playing: ${currentTrack}` : ''}
                </div>
              </IfSubscribed>
              {/* Duplicate content for seamless loop */}
              <div className="text-black font-semibold text-lg ml-1">
                {mounted ? currentDJ : 'Loading...'}
              </div>
              <div className="text-black/70 text-s">
                {mounted ? currentTimeSlot : ''}
              </div>
              <IfSubscribed>
                <div className="text-black text-sm">
                  {!isOffAir && currentTrack ? `Now Playing: ${currentTrack}` : ''}
                </div>
              </IfSubscribed>
              {/* Additional repetitions for wider screens */}
              <div className="text-black font-semibold text-lg ml-1">
                {mounted ? currentDJ : 'Loading...'}
              </div>
              <div className="text-black/70 text-s">
                {mounted ? currentTimeSlot : ''}
              </div>
              <IfSubscribed>
                <div className="text-black text-sm">
                  {!isOffAir && currentTrack ? `Now Playing: ${currentTrack}` : ''}
                </div>
              </IfSubscribed>
              <div className="text-black font-semibold text-lg ml-1">
                {mounted ? currentDJ : 'Loading...'}
              </div>
              <div className="text-black/70 text-s">
                {mounted ? currentTimeSlot : ''}
              </div>
              <IfSubscribed>
                <div className="text-black text-sm">
                  {!isOffAir && currentTrack ? `Now Playing: ${currentTrack}` : ''}
                </div>
              </IfSubscribed>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop View: Play Button + DJ Info + Time, Volume */}
      <div className="hidden sm:flex items-center gap-2 w-full max-w-full">
        {/* Play Button + DJ Info + Time - All on one line */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className="relative group flex-shrink-0"
          >
            <div className="w-8 h-8 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-active:scale-95 disabled:opacity-50">
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6 text-black fill-current" />
              ) : (
                <Play className="w-6 h-6 text-black fill-current" />
              )}
            </div>
          </button>

          {/* DJ Name, Time, and Now Playing - Inline with motion banner */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2 whitespace-nowrap animate-scroll-infinite">
              <div className="text-black font-semibold text-lg">
                {mounted ? currentDJ : 'Loading...'}
              </div>
              <div className="text-black/70 text-s">
                {mounted ? currentTimeSlot : ''}
              </div>
              <IfSubscribed>
                <div className="text-black text-sm">
                  {!isOffAir && currentTrack ? `Now Playing: ${currentTrack}` : ''}
                </div>
              </IfSubscribed>
              {/* Duplicate content for seamless loop */}
              <div className="text-black font-semibold text-lg ml-4">
                {mounted ? currentDJ : 'Loading...'}
              </div>
              <div className="text-black/70 text-s">
                {mounted ? currentTimeSlot : ''}
              </div>
              <IfSubscribed>
                <div className="text-black text-sm">
                  {!isOffAir && currentTrack ? `Now Playing: ${currentTrack}` : ''}
                </div>
              </IfSubscribed>
              {/* Additional repetitions for wider screens */}
              <div className="text-black font-semibold text-lg ml-4">
                {mounted ? currentDJ : 'Loading...'}
              </div>
              <div className="text-black/70 text-s">
                {mounted ? currentTimeSlot : ''}
              </div>
              <IfSubscribed>
                <div className="text-black text-sm">
                  {!isOffAir && currentTrack ? `Now Playing: ${currentTrack}` : ''}
                </div>
              </IfSubscribed>
              <div className="text-black font-semibold text-lg ml-4">
                {mounted ? currentDJ : 'Loading...'}
              </div>
              <div className="text-black/70 text-s">
                {mounted ? currentTimeSlot : ''}
              </div>
              <IfSubscribed>
                <div className="text-black text-sm">
                  {!isOffAir && currentTrack ? `Now Playing: ${currentTrack}` : ''}
                </div>
              </IfSubscribed>
            </div>
          </div>
        </div>

      </div>


      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="none"
      >
        <source src="https://sectorfm.out.airtime.pro/sectorfm_a?_ga=2.90388762.1091420740.1697553650-189609651.1695669989" type="audio/mpeg" />
      </audio>
    </div>
  );
}
