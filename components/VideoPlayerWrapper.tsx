// components/VideoPlayerWrapper.tsx
import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { View, Platform, Text } from 'react-native';
import Video, { ResizeMode } from 'react-native-video';

interface VideoPlayerWrapperProps {
  url: string;
  paused: boolean;
  onLoad: () => void;
  onBuffer: (data: any) => void;
  onProgress: (data: any) => void;
  onError: (error: any) => void;
  onEnd: () => void;
  onReadyForDisplay: () => void;
  licenseType?: string | null;
  licenseKey?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  origin?: string | null;
  aspectRatio: ResizeMode;
  quality: string;
}

// Fallback streams untuk testing
const FALLBACK_STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
];

const VideoPlayerWrapper: React.FC<VideoPlayerWrapperProps> = (props) => {
  const videoRef = useRef<Video>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const isRetryingRef = useRef(false);
  const lastErrorTimeRef = useRef(0);
  const mountedRef = useRef(true);
  
  let { 
    licenseType, 
    licenseKey, 
    url, 
    quality, 
    aspectRatio, 
    paused, 
    userAgent, 
    referrer, 
    origin 
  } = props;

  // Gunakan fallback jika perlu
  const activeUrl = useFallback ? FALLBACK_STREAMS[fallbackIndex] : url;

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset states when URL changes
  useEffect(() => {
    setRetryCount(0);
    isRetryingRef.current = false;
    setUseFallback(false);
    setFallbackIndex(0);
  }, [url]);

  // Debug log
  if (__DEV__) {
    console.log('🎬 [VideoPlayerWrapper]', {
      url: activeUrl?.substring(0, 80) + '...',
      isFallback: useFallback,
      licenseType: licenseType || 'None',
      quality,
    });
  }

  // Konfigurasi DRM
  const drmConfig = useMemo(() => {
    if (!licenseType || useFallback) return {};
    if (licenseType === 'com.widevine.alpha') {
      return {
        drm: {
          type: 'widevine',
          licenseServer: licenseKey || '',
          headers: { 
            'User-Agent': userAgent || 'ExoPlayerDemo/2.19.1', 
            'Content-Type': 'application/octet-stream' 
          },
          multiSession: true,
        },
      };
    }
    if (licenseType === 'clearkey') {
      try {
        const clearKeyData = licenseKey ? JSON.parse(licenseKey) : {};
        return { 
          drm: { 
            type: 'clearkey', 
            licenseServer: clearKeyData.license_url, 
            headers: clearKeyData.headers 
          } 
        };
      } catch (e) {
        console.error('❌ ClearKey parse error:', e);
        return {};
      }
    }
    return {};
  }, [licenseType, licenseKey, userAgent, useFallback]);

  // Konfigurasi buffer
  const bufferConfig = useMemo(() => {
    return { 
      minBufferMs: 15000, 
      maxBufferMs: 60000, 
      bufferForPlaybackMs: 5000, 
      bufferForPlaybackAfterRebufferMs: 10000, 
      backBufferDurationMs: 30000 
    };
  }, []);

  // Source dengan headers
  const source = useMemo(() => {
    const headers: Record<string, string> = {
      'User-Agent': userAgent || 'VLC/3.0.11 LibVLC/3.0.11',
      'Accept': '*/*', 
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive', 
      'Cache-Control': 'no-cache',
    };
    if (referrer && !useFallback) headers['Referer'] = referrer;
    if (origin && !useFallback) headers['Origin'] = origin;
    
    const isHls = activeUrl.includes('.m3u8') || activeUrl.includes('.m3u');
    const isDash = activeUrl.includes('.mpd');
    const isMp4 = activeUrl.includes('.mp4');
    
    let type: 'm3u8' | 'mpd' | 'mp4' | undefined = undefined;
    if (isHls) type = 'm3u8';
    else if (isDash) type = 'mpd';
    else if (isMp4) type = 'mp4';
    
    return { 
      uri: activeUrl, 
      headers,
      type,
    };
  }, [activeUrl, userAgent, referrer, origin, useFallback]);

  // Handle load success
  const handleLoad = useCallback((data: any) => {
    if (!mountedRef.current) return;
    
    console.log('🎬 [Video Loaded] ✅');
    setRetryCount(0);
    isRetryingRef.current = false;
    props.onLoad();
  }, [props.onLoad]);

  // Try next fallback
  const tryNextFallback = useCallback(() => {
    const nextIndex = fallbackIndex + 1;
    if (nextIndex < FALLBACK_STREAMS.length) {
      console.log(`🔄 Trying fallback ${nextIndex + 1}/${FALLBACK_STREAMS.length}`);
      setFallbackIndex(nextIndex);
      setRetryCount(0);
      isRetryingRef.current = false;
      
      setTimeout(() => {
        if (mountedRef.current && videoRef.current) {
          videoRef.current.seek(0);
        }
      }, 500);
    } else {
      console.log('❌ All fallbacks failed');
      props.onError({ errorString: 'All streams failed' });
    }
  }, [fallbackIndex, props.onError]);

  // Handle error
  const handleError = useCallback((error: any) => {
    if (!mountedRef.current) return;
    
    const now = Date.now();
    
    // Throttle error handling
    if (now - lastErrorTimeRef.current < 1500) {
      return;
    }
    lastErrorTimeRef.current = now;
    
    // Prevent multiple retries
    if (isRetryingRef.current) {
      return;
    }
    
    const errorString = error?.errorString || '';
    console.error('❌ Playback Error:', {
      message: errorString || 'Unknown error',
      retryCount: retryCount,
      isFallback: useFallback,
      url: activeUrl.substring(0, 80) + '...',
    });
    
    // If not using fallback yet, switch to fallback
    if (!useFallback) {
      console.log('🔄 Switching to fallback stream...');
      setUseFallback(true);
      setFallbackIndex(0);
      setRetryCount(0);
      return;
    }
    
    // If using fallback and still error, try next fallback
    if (useFallback && retryCount >= 2) {
      tryNextFallback();
      return;
    }
    
    // Normal retry
    if (retryCount < 3) {
      isRetryingRef.current = true;
      console.log(`🔄 Retrying... (${retryCount + 1}/3)`);
      setRetryCount(prev => prev + 1);
      
      setTimeout(() => {
        if (mountedRef.current && videoRef.current) {
          videoRef.current.seek(0);
        }
        setTimeout(() => {
          if (mountedRef.current) {
            isRetryingRef.current = false;
          }
        }, 2000);
      }, 2000);
    } else if (useFallback) {
      tryNextFallback();
    } else {
      console.log('❌ Max retries reached, trying fallback');
      setUseFallback(true);
      setRetryCount(0);
    }
  }, [retryCount, useFallback, activeUrl, tryNextFallback]);

  // Show message when using fallback
  if (useFallback && __DEV__) {
    console.log('⚠️ Using fallback stream for testing');
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Video
        ref={videoRef}
        source={source}
        style={{ flex: 1, backgroundColor: '#000' }}
        resizeMode={aspectRatio}
        paused={paused}
        
        volume={1.0}
        audioOnly={false}
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
        
        selectedAudioTrack={{ type: 'index', value: 0 }}
        selectedTextTrack={{ type: 'system', value: undefined }}
        
        onLoad={handleLoad}
        onBuffer={props.onBuffer}
        onProgress={props.onProgress}
        onError={handleError}
        onEnd={props.onEnd}
        onReadyForDisplay={props.onReadyForDisplay}
        
        bufferConfig={bufferConfig}
        maxBitRate={quality === 'low' ? 1000000 : quality === 'medium' ? 2500000 : 5000000}
        minLoadRetryCount={2}
        retryDelayMs={3000}
        progressUpdateInterval={500}
        
        {...(Platform.OS === 'android' && {
          audioFocusType: 'gain',
        })}
        
        {...drmConfig}
      />
    </View>
  );
};

export default VideoPlayerWrapper;