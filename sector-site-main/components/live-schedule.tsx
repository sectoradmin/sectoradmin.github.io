'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getCurrentAndNextDJ, formatDJDisplay, parseSchedule } from '../lib/schedule';

interface ScheduleSlot {
  startTime: string;
  endTime: string;
  djName: string;
  showName?: string;
  timeSlot: string;
}

export default function LiveSchedule() {
  const [currentDJ, setCurrentDJ] = useState<ScheduleSlot | null>(null);
  const [nextDJ, setNextDJ] = useState<ScheduleSlot | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [fullSchedule, setFullSchedule] = useState<ScheduleSlot[]>([]);

  useEffect(() => {
    setMounted(true);
    
    const updateSchedule = () => {
      const { current, next } = getCurrentAndNextDJ();
      setCurrentDJ(current);
      setNextDJ(next);
      setFullSchedule(parseSchedule());
    };

    // Update immediately
    updateSchedule();
    
    // Update every minute to keep schedule current
    const interval = setInterval(updateSchedule, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Get remaining schedule slots (after current time)
  const getRemainingSchedule = () => {
    if (!mounted) return [];
    
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = estTime.getHours();
    const currentMinute = estTime.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    return fullSchedule.filter(slot => {
      const [startHour, startMinute] = slot.startTime.split(':').map(Number);
      const startTimeInMinutes = startHour * 60 + startMinute;
      return startTimeInMinutes > currentTimeInMinutes;
    });
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <>
        {/* Now Playing */}
        <div className="bg-[#0040ff] p-3 flex items-center">
          <div className="w-0 h-0 border-l-[20px] border-l-white border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent mr-4"></div>
          <span className="text-white font-bold text-lg">Now Playing: Loading...</span>
        </div>

        {/* Up Next */}
        <div className="bg-white p-3">
          <span className="text-black font-bold text-base">Up Next: Loading...</span>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Now Playing */}
      {/* <div className="bg-[#0040ff] p-4 flex items-center">
        <div className="w-0 h-0 border-l-[20px] border-l-white border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent mr-4"></div>
        <span className="text-white font-bold text-lg">
          Now Playing: {currentDJ ? formatDJDisplay(currentDJ) : 'Off Air'}
        </span>
      </div> */}

              {/* Up Next */}
        <div className="bg-white">
          <div 
            className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-300 transition-colors duration-200"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <span className="text-black font-bold text-base">
              Up Next: {nextDJ ? formatDJDisplay(nextDJ) : 'TBA'}
            </span>
            <div className="text-black">
              {isExpanded ? (
                <ChevronUp className="w-6 h-6" />
              ) : (
                <ChevronDown className="w-6 h-6" />
              )}
            </div>
          </div>
          
          {/* Expanded Schedule */}
          {isExpanded && (
            <div className="border-t border-gray-400 bg-white">
              <div className="">
                
                <div className="">
                  {getRemainingSchedule().map((slot, index) => (
                    <div 
                      key={index} 
                      className={`flex justify-between items-center p-2 rounded ${
                        slot === nextDJ ? 'bg-gray-100 border border-gray-300' : 'bg-white'
                      }`}
                    >
                      <span className="text-black font-bold text-sm">
                        {slot.timeSlot}   {formatDJDisplay(slot)}
                      </span>
                      {slot === nextDJ && (
                        <span className="text-blue-600 text-xs font-bold">NEXT</span>
                      )}
                    </div>
                  ))}
                  {getRemainingSchedule().length === 0 && (
                    <div className="text-gray-500 text-center py-3">
                      No more shows scheduled for today
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
    </>
  );
}
