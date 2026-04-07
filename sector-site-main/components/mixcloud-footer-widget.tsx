'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    Mixcloud: {
      FooterWidget?: (url: string, options?: any) => Promise<any>;
    };
  }
}

interface MixcloudFooterWidgetProps {
  feed?: string;
  profile?: string;
  show?: string;
  playlist?: string;
  options?: {
    disablePushstate?: boolean;
    disableHotkeys?: boolean;
    disableUnloadWarning?: boolean;
    hide_artwork?: boolean;
    light?: boolean;
    autoplay?: boolean;
  };
}

export default function MixcloudFooterWidget({ 
  feed = "sectorfm",
  profile,
  show,
  playlist,
  options = {}
}: MixcloudFooterWidgetProps) {
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const widgetInitializedRef = useRef(false);
  const widgetInstanceRef = useRef<any>(null);
  const [isWidgetVisible, setIsWidgetVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Suppress Mixcloud origin errors
    const originalConsoleError = console.error;
    console.error = (...args) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('Playerwidget received message from incorrect origin')) {
        // Suppress this specific error
        return;
      }
      originalConsoleError.apply(console, args);
    };

    // Simple click handler - no complex preloading
    const handleShowClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const playButton = target.closest('[data-mixcloud-play-button]');
      
      console.log('Footer widget click handler triggered', { target, playButton });
      
      if (playButton) {
        const showUrl = playButton.getAttribute('data-mixcloud-play-button');
        console.log('Found play button with URL:', showUrl);
        
        if (showUrl) {
          // Show widget immediately
          setIsWidgetVisible(true);
          setIsLoading(true);
          
          // Check if there's already a global widget instance
          const existingWidget = (window as any).mixcloudWidgetInstance;
          
          if (existingWidget && widgetInitializedRef.current) {
            // Widget exists and is initialized - load new show
            console.log('Loading new show in existing widget:', showUrl);
            try {
              existingWidget.load(showUrl);
              setIsLoading(false);
            } catch (error) {
              console.error('Error loading show in existing widget:', error);
              // Fallback to creating new widget
              initializeWidget(showUrl);
            }
          } else {
            // Widget doesn't exist or isn't initialized - create new widget
            console.log('Creating new widget for show:', showUrl);
            if (!widgetInitializedRef.current) {
              // Load the Mixcloud script if not already loaded
              if (!window.Mixcloud) {
                const script = document.createElement('script');
                script.src = 'https://widget.mixcloud.com/media/js/widgetApi.js';
                script.onload = () => {
                  initializeWidget(showUrl);
                };
                document.head.appendChild(script);
              } else {
                initializeWidget(showUrl);
              }
            } else {
              // Widget was initialized but instance is missing - recreate
              if (window.Mixcloud && window.Mixcloud.FooterWidget) {
                window.Mixcloud.FooterWidget(showUrl, options).then(function(widget) {
                  widgetInstanceRef.current = widget; // Update widget instance
                  (window as any).mixcloudWidgetInstance = widget; // Store globally
                  setIsLoading(false);
                }).catch(function(error) {
                  console.error('Error loading new show:', error);
                  setIsLoading(false);
                });
              }
            }
          }
        }
      }
    };

    const initializeWidget = (showUrl: string) => {
      if (window.Mixcloud && window.Mixcloud.FooterWidget) {
        window.Mixcloud.FooterWidget(showUrl, options).then(function(widget) {
          widgetInitializedRef.current = true;
          widgetInstanceRef.current = widget; // Store widget instance
          (window as any).mixcloudWidgetInstance = widget; // Store globally
          setIsLoading(false);
          
          // Set up play event listener
          if (widget?.events?.play?.on) {
            widget.events.play.on(() => {
              window.dispatchEvent(new CustomEvent('mixcloud-play'));
            });
          }

        }).catch(function(error) {
          console.error('Error initializing widget:', error);
          setIsLoading(false);
        });
      }
    };

    // Add click listener to document to catch all show clicks
    document.addEventListener('click', handleShowClick, true);
    
    // Listen for live-play events to pause Mixcloud widget
    const handleLivePlay = () => {
      console.log('Received live-play event, pausing Mixcloud widget');
      if (widgetInstanceRef.current && widgetInstanceRef.current.pause) {
        try {
          widgetInstanceRef.current.pause();
          console.log('Mixcloud widget paused successfully');
        } catch (error) {
          console.error('Error pausing Mixcloud widget:', error);
        }
      } else {
        console.log('No Mixcloud widget instance available to pause');
      }
    };

    window.addEventListener('live-play', handleLivePlay);

    return () => {
      document.removeEventListener('click', handleShowClick, true);
      window.removeEventListener('live-play', handleLivePlay);
      // Restore original console.error
      console.error = originalConsoleError;
    };

  }, []);

  // Only render the widget container if it should be visible
  if (!isWidgetVisible) {
    return null;
  }

  // Return a container for the Mixcloud Footer Widget to render into
  return <div className="mixcloud-footer-widget-container" />;
}
