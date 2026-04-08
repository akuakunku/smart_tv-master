import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  Dimensions,
  Animated,
  AppState,
  AppStateStatus,
} from 'react-native';
import Video, { ResizeMode } from 'react-native-video';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  url: string;
  isFullscreen: boolean;
  onFullscreenChange: (val: boolean) => void;
  title?: string;
  onReload?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const VideoPlayer: React.FC<Props> = ({ 
  url, 
  isFullscreen, 
  onFullscreenChange, 
  title,
  onReload
}) => {
  const videoRef = useRef<Video>(null);
  const insets = useSafeAreaInsets();
  
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<ResizeMode>(ResizeMode.CONTAIN);
  const [isLocked, setIsLocked] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [quality, setQuality] = useState<'auto' | 'low' | 'medium' | 'high'>('auto');
  const [isFirstLoad, setIsFirstLoad] = useState(true); // Track first load only
  
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const appState = useRef(AppState.currentState);

  const getBufferConfig = useCallback(() => {
    switch(quality) {
      case 'low': 
        return {
          minBufferMs: 3000,       
          maxBufferMs: 15000,       
          bufferForPlaybackMs: 2000, 
          bufferForPlaybackAfterRebufferMs: 3000, 
          backBufferDurationMs: 0,  
        };
      case 'medium': 
        return {
          minBufferMs: 8000,
          maxBufferMs: 30000,
          bufferForPlaybackMs: 3000,
          bufferForPlaybackAfterRebufferMs: 5000,
          backBufferDurationMs: 0,
        };
      case 'high': 
        return {
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 5000,
          bufferForPlaybackAfterRebufferMs: 10000,
          backBufferDurationMs: 30000,
        };
      default: 
        return {
          minBufferMs: 5000,
          maxBufferMs: 25000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 4000,
          backBufferDurationMs: 0,
        };
    }
  }, [quality]);

  const checkInternetSpeed = useCallback(() => {
    const startTime = Date.now();
    fetch('https://www.google.com/favicon.ico', { method: 'HEAD' })
      .then(() => {
        const duration = Date.now() - startTime;
        if (duration > 1000) {
          setQuality('low'); 
        } else if (duration > 500) {
          setQuality('medium'); 
        } else {
          setQuality('high'); 
        }
      })
      .catch(() => {
        setQuality('low'); 
      });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        setPaused(false);
      } else if (nextAppState === 'background') {
        setPaused(true);
      }
      appState.current = nextAppState;
    });
    checkInternetSpeed();

    return () => {
      subscription.remove();
    };
  }, [checkInternetSpeed]);

  const hideControls = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start((finished) => {
      if (finished) setShowControls(false);
    });
  }, [fadeAnim]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!paused) {
      timeoutRef.current = setTimeout(() => {
        hideControls();
      }, 4000);
    }
  }, [paused, hideControls]);

  const showControlsAnim = useCallback(() => {
    setShowControls(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    resetTimer();
  }, [fadeAnim, resetTimer]);

  const toggleControls = () => {
    if (showControls) {
      hideControls();
    } else {
      showControlsAnim();
    }
  };

  const handleMainPress = () => {
    toggleControls();
  };

  const toggleAspectRatio = () => {
    const modes = [ResizeMode.CONTAIN, ResizeMode.COVER, ResizeMode.STRETCH];
    const nextIndex = (modes.indexOf(aspectRatio) + 1) % modes.length;
    setAspectRatio(modes[nextIndex]);
    resetTimer();
  };

  const handlePlayPause = () => {
    setPaused(!paused);
    resetTimer();
  };

  const handleLockToggle = () => {
    setIsLocked(!isLocked);
    resetTimer();
  };

  const handleReload = () => {
    if (onReload) {
      onReload();
    } else {
      setLoading(true);
      setBufferProgress(0);
      setIsFirstLoad(true);
    }
    resetTimer();
  };

  // PERBAIKAN: Jangan set loading false saat fullscreen change
  const handleVideoLoad = () => {
    setLoading(false);
    setIsFirstLoad(false);
  };

  const handleBuffer = ({ isBuffering }: { isBuffering: boolean }) => {
    // Only show loading for actual buffering, not for fullscreen transition
    if (!isFirstLoad && isBuffering) {
      setLoading(true);
    } else if (!isBuffering && !isFirstLoad) {
      setLoading(false);
    }
  };

  const handleProgress = (data: any) => {
    if (data.playableDuration && data.currentTime && !isFirstLoad) {
      const buffered = data.playableDuration - data.currentTime;
      const totalBuffer = data.playableDuration;
      if (totalBuffer > 0) {
        setBufferProgress((buffered / totalBuffer) * 100);
      }
    }
  };

  const handleError = (error: any) => {
    console.log('Video Error:', error);
    setLoading(false);
  };

  useEffect(() => {
    showControlsAnim();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [showControlsAnim]);

  const renderQualityBadge = () => {
    if (quality === 'low') {
      return (
        <View style={styles.qualityBadge}>
          <MaterialCommunityIcons name="signal-cellular-1" size={12} color="#ff9800" />
          <Text style={styles.qualityText}>Slow</Text>
        </View>
      );
    } else if (quality === 'medium') {
      return (
        <View style={styles.qualityBadge}>
          <MaterialCommunityIcons name="signal-cellular-2" size={12} color="#4caf50" />
          <Text style={styles.qualityText}>Normal</Text>
        </View>
      );
    }
    return null;
  };

  const renderTopBar = () => (
    <View style={[styles.topBar, { paddingTop: isFullscreen ? 20 : Math.max(insets.top, 10) }]}>
      <TouchableOpacity onPress={() => onFullscreenChange(false)} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </TouchableOpacity>
      
      <View style={styles.titleContainer}>
        <Text style={styles.titleText} numberOfLines={1}>
          {isLocked ? "🔒 Layar Terkunci" : (title || "Streaming Live")}
        </Text>
        {renderQualityBadge()}
      </View>

      {!isLocked && (
        <TouchableOpacity onPress={handleReload} style={styles.reloadButton}>
          <MaterialCommunityIcons name="reload" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderMiddleControls = () => (
    <View style={styles.midControls}>
      {!isLocked ? (
        <>
          <TouchableOpacity onPress={handlePlayPause} style={styles.playPauseButton} activeOpacity={0.8}>
            <Ionicons name={paused ? "play" : "pause"} size={50} color="#fff" />
          </TouchableOpacity>
          
          {loading && bufferProgress > 0 && isFirstLoad && (
            <View style={styles.bufferIndicator}>
              <View style={[styles.bufferFill, { width: `${bufferProgress}%` }]} />
            </View>
          )}
        </>
      ) : (
        <View style={styles.lockIconContainer}>
          <Ionicons name="lock-closed" size={50} color="rgba(237, 236, 37, 0.6)" />
          <Text style={styles.lockText}>Terkunci</Text>
        </View>
      )}
    </View>
  );

  const renderBottomBar = () => (
    <View style={[styles.bottomBar, { paddingBottom: isFullscreen ? 20 : 15 }]}>
      <TouchableOpacity onPress={handleLockToggle} style={[styles.bottomButton, isLocked && styles.activeBottomButton]}>
        <Ionicons 
          name={isLocked ? "lock-closed" : "lock-open-outline"} 
          size={20} 
          color={isLocked ? "#edec25" : "#fff"} 
        />
        <Text style={[styles.bottomButtonText, isLocked && styles.activeBottomButtonText]}>
          {isLocked ? "Terkunci" : "Kunci"}
        </Text>
      </TouchableOpacity>

      {!isLocked && (
        <>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
            {quality === 'low' && (
              <View style={styles.slowWarning}>
                <Text style={styles.slowWarningText}>!</Text>
              </View>
            )}
          </View>

          <View style={styles.rightControls}>
            <TouchableOpacity onPress={toggleAspectRatio} style={styles.bottomButton}>
              <MaterialCommunityIcons name="aspect-ratio" size={20} color="#fff" />
              <Text style={styles.bottomButtonText}>
                {aspectRatio === ResizeMode.CONTAIN ? "Fit" : aspectRatio === ResizeMode.COVER ? "Fill" : "Stretch"}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => onFullscreenChange(!isFullscreen)} style={styles.bottomButton}>
              <Ionicons name={isFullscreen ? "contract" : "expand"} size={20} color="#fff" />
              <Text style={styles.bottomButtonText}>
                {isFullscreen ? "Exit" : "Full"}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        activeOpacity={1} 
        onPress={handleMainPress} 
        style={styles.touchableArea}
      >
        <Video
          ref={videoRef}
          source={{ uri: url, headers: { 'User-Agent': 'VLC/3.0.11' } }}
          style={styles.video}
          resizeMode={aspectRatio}
          paused={paused}
          onLoad={handleVideoLoad}
          onBuffer={handleBuffer}
          onProgress={handleProgress}
          onError={handleError}
          playInBackground={false}
          playWhenInactive={false}
          ignoreSilentSwitch="ignore"
          repeat={false}
          bufferConfig={getBufferConfig()}
          maxBitRate={quality === 'low' ? 500000 : quality === 'medium' ? 1500000 : 4000000}
        />

        {showControls && (
          <Animated.View style={[styles.controlsOverlay, { opacity: fadeAnim }]}>
            <LinearGradient 
              colors={['rgba(0,0,0,0.8)', 'transparent', 'rgba(0,0,0,0.8)']} 
              style={StyleSheet.absoluteFillObject} 
            />
            {renderTopBar()}
            {renderMiddleControls()}
            {renderBottomBar()}
          </Animated.View>
        )}

        {/* PERBAIKAN: Only show loading for first load, not for fullscreen transition */}
        {loading && isFirstLoad && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#edec25" />
              <Text style={styles.loadingText}>
                {quality === 'low' ? 'Koneksi lambat, memuat...' : 'Memuat Stream...'}
              </Text>
              {quality === 'low' && (
                <Text style={styles.loadingSubText}>
                  Streaming mungkin akan terputus-putus
                </Text>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  touchableArea: {
    flex: 1,
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  qualityText: {
    color: '#fff',
    fontSize: 10,
  },
  reloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  midControls: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(237, 236, 37, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#edec25',
  },
  bufferIndicator: {
    position: 'absolute',
    bottom: -40,
    width: 200,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  bufferFill: {
    height: '100%',
    backgroundColor: '#edec25',
  },
  lockIconContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
  },
  lockText: {
    color: 'rgba(237, 236, 37, 0.6)',
    fontSize: 12,
    marginTop: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bottomButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 6,
  },
  activeBottomButton: {
    backgroundColor: 'rgba(237, 236, 37, 0.2)',
    borderWidth: 1,
    borderColor: '#edec25',
  },
  bottomButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
  activeBottomButtonText: {
    color: '#edec25',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,0,0,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.5)',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff0000',
  },
  liveText: {
    color: '#ff0000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  slowWarning: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ff9800',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slowWarningText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  rightControls: {
    flexDirection: 'row',
    gap: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingCard: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    minWidth: 200,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingSubText: {
    color: '#ff9800',
    fontSize: 11,
    textAlign: 'center',
  },
});

export default VideoPlayer;