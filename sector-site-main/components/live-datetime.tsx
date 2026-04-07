'use client';

import { useState, useEffect } from 'react';

export default function LiveDateTime() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Don't render anything until mounted on client to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="text-center">
        <div className="text-white font-bold text-sm sm:text-lg">Loading...</div>
        <div className="text-white font-bold text-lg sm:text-xl">--:--:--</div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="text-white font-bold text-sm sm:text-lg">{formatDate(currentTime)}</div>
      <div className="text-white font-bold text-lg sm:text-xl">{formatTime(currentTime)}</div>
    </div>
  );
}
