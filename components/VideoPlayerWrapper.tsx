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

const VideoPlayerWrapper: React.FC<VideoPlayerWrapperProps> = (props) => {
  const videoRef = useRef<Video>(null);

  const [retryCount, setRetryCount] = useState(0);
  const [showError, setShowError] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);

  const mountedRef = useRef(true);

  const {
    licenseType,
    licenseKey,
    url,
    quality,
    aspectRatio,
    paused,
    userAgent,
    referrer,
    origin,
  } = props;

  const isLive = useMemo(() => {
    return url.includes('.m3u8');
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setRetryCount(0);
    setShowError(false);
    setPlayerKey(prev => prev + 1); // reset player saat URL berubah
  }, [url]);

  // DRM
  const drmConfig = useMemo(() => {
    if (!licenseType) return {};

    if (licenseType === 'com.widevine.alpha') {
      return {
        drm: {
          type: 'widevine',
          licenseServer: licenseKey || '',
          headers: {
            'User-Agent': userAgent || 'ExoPlayer',
            'Content-Type': 'application/octet-stream',
          },
        },
      };
    }

    return {};
  }, [licenseType, licenseKey, userAgent]);

  const bufferConfig = {
    minBufferMs: 15000,
    maxBufferMs: 60000,
    bufferForPlaybackMs: 5000,
    bufferForPlaybackAfterRebufferMs: 10000,
  };

  const source = useMemo(() => {
    const headers: Record<string, string> = {
      'User-Agent': userAgent || 'VLC/3.0.11',
    };

    if (referrer) headers['Referer'] = referrer;
    if (origin) headers['Origin'] = origin;

    return {
      uri: url,
      headers,
    };
  }, [url, userAgent, referrer, origin]);

  // ✅ LOAD
  const handleLoad = useCallback(() => {
    if (!mountedRef.current) return;

    console.log('🎬 Loaded:', url);
    setRetryCount(0);
    setShowError(false);
    props.onLoad();
  }, [url]);

  // ✅ ERROR
  const handleError = useCallback((error: any) => {
    if (!mountedRef.current) return;

    console.log('❌ Error:', JSON.stringify(error, null, 2));

    if (retryCount < 2) {
      console.log(`🔄 Retry ${retryCount + 1}/2`);
      setRetryCount(prev => prev + 1);

      setTimeout(() => {
        if (mountedRef.current) {
          setPlayerKey(prev => prev + 1); // reload player
        }
      }, 2000);

      return;
    }

    console.log('❌ Final error, stop retry');
    setShowError(true);
    props.onError(error);
  }, [retryCount]);

  // ✅ END
  const handleEnd = useCallback(() => {
    console.log('🏁 Stream ended');

    if (isLive) {
      console.log('🔄 Reconnecting live stream...');
      setTimeout(() => {
        if (mountedRef.current) {
          setPlayerKey(prev => prev + 1);
        }
      }, 1500);
    } else {
      props.onEnd();
    }
  }, [isLive]);

  if (showError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red' }}>Stream tidak bisa diputar</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Video
        key={playerKey}
        ref={videoRef}
        source={source}
        style={{ flex: 1 }}
        resizeMode={aspectRatio}
        paused={paused}

        onLoad={handleLoad}
        onBuffer={props.onBuffer}
        onProgress={props.onProgress}
        onError={handleError}
        onEnd={handleEnd}
        onReadyForDisplay={props.onReadyForDisplay}
    
        bufferConfig={bufferConfig}
        progressUpdateInterval={500}

        maxBitRate={
          quality === 'low' ? 1000000 :
          quality === 'medium' ? 2500000 :
          5000000
        }

        {...(Platform.OS === 'android' && {
          audioFocusType: 'gain',
        })}

        {...drmConfig}
      />
    </View>
  );
};

export default VideoPlayerWrapper;