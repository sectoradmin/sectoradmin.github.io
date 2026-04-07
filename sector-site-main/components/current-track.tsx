'use client';

import { useState, useEffect } from 'react';

interface CurrentTrackProps {
  className?: string;
}

export default function CurrentTrack({ className = '' }: CurrentTrackProps) {
  const [trackInfo, setTrackInfo] = useState<string>('Loading...');
  const [mounted, setMounted] = useState(false);
  const [isOffAir, setIsOffAir] = useState(false);

  const PROXY = 'https://corsproxy.io/?';
  const MAPPING_URL = PROXY + encodeURIComponent(
    'https://docs.google.com/spreadsheets/d/1nCFcaCWKtijfna6Jmu5Z0Tk-olGo_yCS2v2PSUinMr0/gviz/tq?tqx=out:json'
  );

  const getSheetIdForShow = async (showName: string): Promise<string | null> => {
    try {
      const res = await fetch(MAPPING_URL);
      const text = await res.text();
      const json = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
      const rows = json.table.rows;

      for (const row of rows) {
        const name = row.c[0]?.v?.trim();
        const url = row.c[1]?.v?.trim();
        if (name && url && name.toLowerCase() === showName.toLowerCase()) {
          const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
          return match ? match[1] : null;
        }
      }
    } catch (err) {
      console.error("Error reading mapping sheet:", err);
    }
    return null;
  };

  const fetchNowPlayingFromSheet = async (sheetId: string): Promise<void> => {
    try {
      const sheetURL = PROXY + encodeURIComponent(
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`
      );
      const res = await fetch(sheetURL);
      const text = await res.text();
      const json = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
      const rows = json.table.rows;

      let latest = null;
      for (let i = rows.length - 1; i >= 0; i--) {
        const artist = rows[i].c[1]?.v?.trim(); // Column B
        const track = rows[i].c[3]?.v?.trim(); // Column D
        if (artist || track) {
          latest = { artist, track };
          break;
        }
      }

      if (latest) {
        const display = `${latest.artist || 'Unknown Artist'} – ${latest.track || 'Untitled Track'}`;
        setTrackInfo(display);
      } else {
        setTrackInfo('No track data');
      }
    } catch (err) {
      console.error("Error fetching track from sheet:", err);
      setTrackInfo('Unavailable');
    }
  };

  const updateNowPlaying = async (): Promise<void> => {
    try {
      const res = await fetch('https://sectorfm.airtime.pro/api/live-info-v2');
      const data = await res.json();

      const show = data.shows?.current;
      const showName = show?.name || 'No Show Info';
      const isLive = show?.auto_dj === false;

      // Check if we're off air by looking at the schedule
      const { getCurrentAndNextDJ } = await import('../lib/schedule');
      const { current } = getCurrentAndNextDJ();
      const isOffAir = !current;
      setIsOffAir(isOffAir);

      // If off air, don't show track info
      if (isOffAir) {
        setTrackInfo('');
        return;
      }

      if (isLive) {
        const sheetId = await getSheetIdForShow(showName);
        if (sheetId) {
          await fetchNowPlayingFromSheet(sheetId);
          return;
        }
      }

      const track = data.tracks.current?.metadata || {};
      const fallback = track.track_title && track.artist_name
        ? `${track.artist_name} – ${track.track_title}`
        : data.tracks.current?.name || 'Unknown Track';
      setTrackInfo(fallback);

    } catch (err) {
      console.error('Error fetching show info:', err);
      setTrackInfo('Unavailable');
    }
  };

  useEffect(() => {
    setMounted(true);
    
    // Update immediately
    updateNowPlaying();
    
    // Update every 30 seconds
    const interval = setInterval(updateNowPlaying, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <span className={className}>Now Playing: Loading...</span>
    );
  }

  // Don't render anything if off air
  if (isOffAir) {
    return null;
  }

  return (
    <span className={className}>Now Playing: {trackInfo}</span>
  );
}
