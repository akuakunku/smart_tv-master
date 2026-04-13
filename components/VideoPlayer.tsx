// components/VideoPlayer.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator, Text,
  Dimensions, AppState, AppStateStatus, Animated, Platform,
  Clipboard, Alert as RNAlert, StatusBar,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Video, { ResizeMode, OnBufferData, OnErrorData, OnLoadData, OnProgressData } from 'react-native-video';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { watchHistoryEvent } from '../utils/events';
import VideoPlayerWrapper from './VideoPlayerWrapper';
import {
  getVideoFormatInfo,
  extractLicenseInfo,
  isValidVideoUrl,
  getAlternativeUrl,
} from '../utils/videoFormats';

import Colors from '../constants/Colors';

interface Props {
  url: string;
  isFullscreen: boolean;
  onFullscreenChange: (val: boolean) => void;
  title?: string;
  onReload?: () => void;
  licenseType?: string | null;
  licenseKey?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  origin?: string | null;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

interface WatchHistoryItem {
  url: string;
  name: string;
  logo?: string;
  group?: string;
  timestamp: number;
  watchedAt: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const VideoPlayer: React.FC<Props> = ({
  url,
  isFullscreen,
  onFullscreenChange,
  title,
  onReload,
  licenseType,
  licenseKey,
  userAgent,
  referrer,
  origin,
  onTimeUpdate
}) => {
  const insets = useSafeAreaInsets();
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<ResizeMode>(ResizeMode.CONTAIN);
  const [isLocked, setIsLocked] = useState(false);
  const [quality, setQuality] = useState<'auto' | 'low' | 'medium' | 'high'>('auto');
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [useAlternativeUrl, setUseAlternativeUrl] = useState(false);

  const hasSavedHistoryRef = useRef(false);
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef(AppState.currentState);
  const healthCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualReloadRef = useRef(false);
  const lastProgressTimeRef = useRef(Date.now());
  const lastCurrentTimeRef = useRef(0);
  const stuckCountRef = useRef(0);
  const videoWrapperRef = useRef<Video>(null);
  const errorCountRef = useRef(0);

  // ============================================
  // FULLSCREEN NAVIGATION BAR MANAGEMENT
  // ============================================
  
  useEffect(() => {
    if (isFullscreen) {
      // Sembunyikan status bar
      StatusBar.setHidden(true, 'fade');
      
      // Sembunyikan navigation bar di Android
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('hidden');
      }
    } else {
      // Tampilkan status bar
      StatusBar.setHidden(false, 'fade');
      
      // Tampilkan navigation bar di Android
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('visible');
      }
    }
    
    // Cleanup
    return () => {
      if (isFullscreen) {
        StatusBar.setHidden(false, 'fade');
        if (Platform.OS === 'android') {
          NavigationBar.setVisibilityAsync('visible');
        }
      }
    };
  }, [isFullscreen]);

  // Format info - menggunakan useMemo
  const formatInfo = useMemo(() => getVideoFormatInfo(url), [url]);
  const isDASH = formatInfo.isDASH;
  const isHLS = formatInfo.isHLS;
  const alternativeUrls = useMemo(() => getAlternativeUrl(url), [url]);

  // Validasi URL playlist dan coba URL alternatif
  useEffect(() => {
    const validateAndPlay = async () => {
      if (url.includes('raw.githubusercontent.com') || url.includes('pastebin.com')) {
        console.warn('⚠️ [VIDEO] This appears to be a playlist file, not a video stream');
        setFatalError('URL ini adalah file playlist M3U, bukan stream video. Pilih channel yang benar.');
        setLoading(false);
        return;
      }
      
      if (!isValidVideoUrl(url)) {
        if (alternativeUrls.length > 1 && !useAlternativeUrl) {
          console.log('🔄 [VIDEO] Trying alternative URL...');
          setCurrentUrl(alternativeUrls[1]);
          setUseAlternativeUrl(true);
          return;
        }
        console.warn('⚠️ [VIDEO] Invalid video URL:', url);
        setFatalError('URL video tidak valid');
        setLoading(false);
      } else {
        setCurrentUrl(url);
      }
    };
    
    validateAndPlay();
  }, [url, alternativeUrls, useAlternativeUrl]);

  useEffect(() => {
    console.log(`📹 [VIDEO] Format info for ${title || 'unknown'}:`, {
      protocol: formatInfo.protocol,
      isDASH: formatInfo.isDASH,
      isHLS: formatInfo.isHLS,
      needsLicense: formatInfo.needsLicense,
      extension: formatInfo.extension,
      alternativeUrls: alternativeUrls.length
    });

    if (!licenseType || !licenseKey) {
      const extractedLicense = extractLicenseInfo(url);
      if (extractedLicense.type && !licenseType) {
        console.log('🔑 [DRM] License type extracted from URL:', extractedLicense.type);
      }
      if (extractedLicense.key && !licenseKey) {
        console.log('🔑 [DRM] License key extracted from URL');
      }
    }
  }, [url, formatInfo, alternativeUrls]);

  const saveToWatchHistory = useCallback(async (channel: { url: string; name: string; logo?: string; group?: string }) => {
    if (!channel.url || !channel.name) return;
    try {
      const stored = await AsyncStorage.getItem("watchHistory");
      let history = stored ? JSON.parse(stored) : [];
      history = history.filter((item: WatchHistoryItem) => item.url !== channel.url);
      history.unshift({ ...channel, timestamp: Date.now(), watchedAt: new Date().toISOString() });
      if (history.length > 50) history = history.slice(0, 50);
      await AsyncStorage.setItem("watchHistory", JSON.stringify(history));
      watchHistoryEvent.emit('historyUpdated');
      console.log('✅ [HISTORY] Saved:', channel.name);
    } catch (error) {
      console.error("❌ [HISTORY] Save error:", error);
    }
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true
        }),
        Animated.timing(pulseValue, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true
        })
      ])
    ).start();
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const fadeOutLoading = useCallback(() => {
    Animated.timing(loadingOpacity, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true
    }).start(() => setLoading(false));
  }, [loadingOpacity]);

  const showLoading = useCallback(() => {
    setLoading(true);
    Animated.timing(loadingOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true
    }).start();
  }, [loadingOpacity]);

  const checkInternetSpeed = useCallback(async () => {
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      if (duration > 1500) setQuality('low');
      else if (duration > 700) setQuality('medium');
      else setQuality('high');
      console.log(`📡 [NETWORK] Speed test: ${duration}ms`);
    } catch (error) {
      setQuality('medium');
      console.log('📡 [NETWORK] Speed test failed, using medium quality');
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        setPaused(false);
        console.log('🔄 [APP] App resumed, playing');
      } else if (nextAppState === 'background') {
        setPaused(true);
        console.log('⏸️ [APP] App backgrounded, pausing');
      }
      appState.current = nextAppState;
    });

    checkInternetSpeed();

    return () => subscription.remove();
  }, [checkInternetSpeed]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startAutoHideTimer = useCallback(() => {
    clearTimer();
    if (showControls && !isLocked && !paused && !loading && !isBuffering) {
      timerRef.current = setTimeout(() => {
        setShowControls(false);
        timerRef.current = null;
      }, 4000);
    }
  }, [showControls, isLocked, paused, loading, isBuffering, clearTimer]);

  useEffect(() => {
    if (showControls && !isLocked && !paused && !loading && !isBuffering) {
      startAutoHideTimer();
    } else {
      clearTimer();
    }
    return () => clearTimer();
  }, [showControls, isLocked, paused, loading, isBuffering, startAutoHideTimer, clearTimer]);

  const startHealthCheck = useCallback(() => {
    if (healthCheckRef.current) clearTimeout(healthCheckRef.current);
    if (!isFirstLoad && !paused && !isBuffering && !loading) {
      healthCheckRef.current = setTimeout(() => {
        const now = Date.now();
        const timeSinceLastProgress = now - lastProgressTimeRef.current;
        const isReallyStuck = timeSinceLastProgress > 20000 &&
          lastCurrentTimeRef.current === 0 &&
          !isBuffering &&
          !loading;

        if (isReallyStuck && !isManualReloadRef.current) {
          stuckCountRef.current++;
          console.log(`⚠️ [HEALTH] Stream stuck, retry ${stuckCountRef.current}/3`);

          if (stuckCountRef.current <= 3) {
            isManualReloadRef.current = true;
            handleReload();
            setTimeout(() => {
              isManualReloadRef.current = false;
              if (stuckCountRef.current >= 3) stuckCountRef.current = 0;
            }, 3000);
          }
        } else if (timeSinceLastProgress > 5000 && lastCurrentTimeRef.current > 0) {
          stuckCountRef.current = 0;
        }
        startHealthCheck();
      }, 20000);
    }
  }, [isFirstLoad, paused, isBuffering, loading]);

  const stopHealthCheck = useCallback(() => {
    if (healthCheckRef.current) {
      clearTimeout(healthCheckRef.current);
      healthCheckRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isFirstLoad && !paused && !isBuffering) {
      startHealthCheck();
    } else {
      stopHealthCheck();
    }
    return () => stopHealthCheck();
  }, [isFirstLoad, paused, isBuffering, startHealthCheck, stopHealthCheck]);

  const handleTap = useCallback(() => {
    clearTimer();
    setShowControls(prev => !prev);
  }, [clearTimer]);

  const toggleAspectRatio = () => {
    const modes = [ResizeMode.CONTAIN, ResizeMode.COVER, ResizeMode.STRETCH];
    const nextIndex = (modes.indexOf(aspectRatio) + 1) % modes.length;
    setAspectRatio(modes[nextIndex]);
    console.log(`📐 [UI] Aspect ratio changed to: ${modes[nextIndex]}`);
  };

  const handlePlayPause = () => {
    setPaused(!paused);
    console.log(`⏯️ [PLAYBACK] ${paused ? 'Playing' : 'Paused'}`);
  };

  const handleLockToggle = () => {
    clearTimer();
    setIsLocked(prev => !prev);
    if (!isLocked) setShowControls(false);
    else setShowControls(true);
    console.log(`🔒 [UI] Controls ${!isLocked ? 'locked' : 'unlocked'}`);
  };

  const handleReload = useCallback(() => {
    clearTimer();
    isManualReloadRef.current = true;
    stuckCountRef.current = 0;
    errorCountRef.current = 0;
    setRetryCount(prev => prev + 1);
    setFatalError(null);
    showLoading();
    if (onReload) onReload();
    setTimeout(() => {
      isManualReloadRef.current = false;
    }, 2000);
    console.log('🔄 [PLAYER] Manual reload triggered');
  }, [onReload, showLoading, clearTimer]);

  const handleCopyUrl = useCallback(() => {
    Clipboard.setString(currentUrl);
    RNAlert.alert('Berhasil', 'URL stream telah disalin ke clipboard');
  }, [currentUrl]);

  const handleVideoLoad = useCallback((data?: OnLoadData) => {
    setIsFirstLoad(false);
    setShowControls(true);
    fadeOutLoading();
    lastProgressTimeRef.current = Date.now();
    stuckCountRef.current = 0;
    errorCountRef.current = 0;
    setFatalError(null);

    let duration = data?.duration ?? 0;
    if (duration < 0 || duration > 1e9) {
      duration = 0;
      console.log('⚠️ [VIDEO] Invalid duration detected, using 0');
    }
    setVideoDuration(duration);

    if (!hasSavedHistoryRef.current && title) {
      hasSavedHistoryRef.current = true;
      saveToWatchHistory({ url: currentUrl, name: title });
    }

    console.log(`✅ [VIDEO] Loaded successfully - Duration: ${duration}s, Format: ${formatInfo.protocol}`);
  }, [fadeOutLoading, title, currentUrl, saveToWatchHistory, formatInfo]);

  const handleBuffer = useCallback((data?: OnBufferData) => {
    const isBufferingValue = data?.isBuffering ?? false;

    if (isBufferingValue) {
      setIsBuffering(true);
      if (!isFirstLoad) showLoading();
      console.log('⏳ [BUFFER] Started buffering');
    } else {
      setIsBuffering(false);
      if (!isFirstLoad) {
        fadeOutLoading();
        lastProgressTimeRef.current = Date.now();
      }
      console.log('✅ [BUFFER] Buffering complete');
    }
  }, [isFirstLoad, showLoading, fadeOutLoading]);

  const handleProgress = useCallback((data?: OnProgressData) => {
    if (data?.currentTime !== undefined && data.currentTime >= 0) {
      const now = Date.now();
      const currentTimeDiff = Math.abs(data.currentTime - lastCurrentTimeRef.current);
      lastProgressTimeRef.current = now;
      lastCurrentTimeRef.current = data.currentTime;
      setCurrentTime(data.currentTime);

      if (onTimeUpdate) {
        onTimeUpdate(data.currentTime, data.seekableDuration ?? videoDuration);
      }

      if (data.playableDuration && data.playableDuration > 0 && data.currentTime >= 0) {
        const buffered = data.playableDuration - data.currentTime;
        if (buffered > 0) {
          const progress = Math.min((buffered / data.playableDuration) * 100, 100);
          setBufferProgress(progress);
        }
      }

      if (currentTimeDiff > 0.1) stuckCountRef.current = 0;
    }
  }, [videoDuration, onTimeUpdate]);

  const handleError = useCallback((error: OnErrorData) => {
    errorCountRef.current++;
    console.error(`❌ [VIDEO] Error (${errorCountRef.current}):`, error?.error?.errorString || error?.error?.errorException || 'Unknown error');

    const errorString = error?.error?.errorString || '';
    
    const isHttp404 = errorString.includes('404') || errorString.includes('HTTP 404');
    
    if (isHttp404 && !useAlternativeUrl && alternativeUrls.length > 1) {
      console.log('🔄 [VIDEO] HTTP 404, trying alternative URL...');
      setCurrentUrl(alternativeUrls[1]);
      setUseAlternativeUrl(true);
      setTimeout(() => handleReload(), 500);
      return;
    }
    
    const isMalformedManifest = errorString.includes('ERROR_CODE_PARSING_MANIFEST_MALFORMED') ||
                                errorString.includes('Manifest malformed') ||
                                errorString.includes('Invalid manifest');
    
    if (isMalformedManifest) {
      console.log('📄 [VIDEO] Malformed manifest (nested playlist)');
      setFatalError('URL ini adalah file playlist, bukan stream video langsung');
      fadeOutLoading();
      setIsBuffering(false);
      return;
    }
    
    const isCurrentActivityNull = errorString.includes('Current Activity is null') ||
                                  errorString.includes('Failed to initialize Player');
    
    if (isCurrentActivityNull) {
      console.log('💀 [VIDEO] Current Activity null error');
      setFatalError('Stream tidak dapat diputar. Server mungkin memblokir akses.');
      fadeOutLoading();
      setIsBuffering(false);
      return;
    }
    
    const isDrmError = errorString.includes('DRM') || errorString.includes('drm') || errorString.includes('license');
    const isNetworkError = error?.error?.code === -1009 || error?.error?.code === -1005;
    const isFatal = errorString.includes('Current Activity is null') || errorString.includes('Failed to initialize Player');

    if (isFatal || isDrmError) {
      console.log(isFatal ? '💀 [VIDEO] Fatal error' : '🔒 [VIDEO] DRM error');
      setFatalError(isDrmError ? 'Stream dilindungi DRM dan tidak dapat diputar' : 'Tidak dapat memutar stream ini');
      fadeOutLoading();
      setIsBuffering(false);
      return;
    }

    if (isNetworkError && retryCount < 3) {
      console.log(`🌐 [NETWORK] Network error, retry ${retryCount + 1}/3`);
      setRetryCount(prev => prev + 1);
      setTimeout(() => handleReload(), 2000);
    } else if (!isNetworkError && retryCount < 2 && errorCountRef.current < 5) {
      console.log(`🔄 [RETRY] Attempt ${retryCount + 1}/2`);
      setRetryCount(prev => prev + 1);
      setTimeout(() => handleReload(), 3000);
    } else {
      console.log('❌ [VIDEO] Max retries reached');
      setFatalError('Gagal memutar stream. Coba channel lain.');
      fadeOutLoading();
      setIsBuffering(false);
    }
  }, [fadeOutLoading, retryCount, handleReload, alternativeUrls, useAlternativeUrl]);

  const handleEnd = useCallback(() => {
    if (!isFirstLoad && !isManualReloadRef.current) {
      console.log('🏁 [VIDEO] Stream ended, auto-reconnecting...');
      setTimeout(() => handleReload(), 1000);
    }
  }, [isFirstLoad, handleReload]);

  const handleReadyForDisplay = useCallback(() => {
    fadeOutLoading();
    setIsBuffering(false);
    console.log('🖥️ [VIDEO] Ready for display');
  }, [fadeOutLoading]);

  useEffect(() => {
    hasSavedHistoryRef.current = false;
  }, [currentUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (healthCheckRef.current) clearTimeout(healthCheckRef.current);
      console.log('🧹 [PLAYER] Cleanup');
    };
  }, []);

  if (fatalError) {
    return (
      <View style={styles.errorContainer}>
        <MaterialCommunityIcons name="alert-circle" size={48} color="#ff4444" />
        <Text style={styles.errorTitle}>Tidak Dapat Memutar Stream</Text>
        <Text style={styles.errorMessage}>{fatalError}</Text>
        <View style={styles.errorButtonsRow}>
          <TouchableOpacity style={styles.errorButton} onPress={handleReload}>
            <Text style={styles.errorButtonText}>Coba Lagi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.errorButton, styles.copyButton]} onPress={handleCopyUrl}>
            <Text style={styles.errorButtonText}>Salin URL</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const renderQualityBadge = () => {
    let icon = '', text = '', color = '';
    switch (quality) {
      case 'low': 
        icon = "signal-cellular-1"; 
        text = "Slow"; 
        color = "#ff9800"; 
        break;
      case 'medium': 
        icon = "signal-cellular-2"; 
        text = "Normal"; 
        color = "#4caf50"; 
        break;
      case 'high': 
        icon = "signal-cellular-3"; 
        text = "Fast"; 
        color = "#2196f3"; 
        break;
      default: 
        return null;
    }
    return (
      <View style={[styles.qualityBadge, { borderColor: color }]}>
        <MaterialCommunityIcons name={icon as any} size={12} color={color} />
        <Text style={[styles.qualityText, { color }]}>{text}</Text>
      </View>
    );
  };

  const renderFormatBadge = () => {
    let text = '';
    if (isDASH) text = 'DASH';
    else if (isHLS) text = 'HLS';
    else if (formatInfo.protocol === 'progressive') text = 'MP4';
    else text = formatInfo.protocol.toUpperCase();
    
    if (!text || text === 'UNKNOWN') return null;
    
    const color = isDASH ? '#4caf50' : isHLS ? '#2196f3' : '#ff9800';
    
    return (
      <View style={[styles.formatBadge, { borderColor: color }]}>
        <Text style={[styles.formatBadgeText, { color }]}>{text}</Text>
      </View>
    );
  };

  const renderTopBar = () => (
    <View style={[styles.topBar, {
      paddingTop: isFullscreen ? 16 : Math.max(insets.top, 12),
      paddingBottom: 12,
      paddingHorizontal: isFullscreen ? 20 : 16
    }]}>
      {isFullscreen && (
        <TouchableOpacity onPress={() => onFullscreenChange(false)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
      )}
      {!isFullscreen && <View style={styles.backButtonPlaceholder} />}

      <View style={styles.titleContainer}>
        <Text style={styles.titleText} numberOfLines={1}>
          {isLocked ? "🔒 Layar Terkunci" : (title || "Streaming Live")}
        </Text>
        {renderFormatBadge()}
        {renderQualityBadge()}
        {licenseType && (
          <View style={styles.drmBadge}>
            <MaterialCommunityIcons name="shield-lock" size={10} color="#edec25" />
            <Text style={styles.drmBadgeText}>
              {licenseType === 'com.widevine.alpha' ? 'Widevine' :
                licenseType === 'clearkey' ? 'ClearKey' :
                  licenseType === 'org.w3.clearkey' ? 'ClearKey' : 'DRM'}
            </Text>
          </View>
        )}
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
        <TouchableOpacity onPress={handlePlayPause} style={styles.playPauseButton} activeOpacity={0.8}>
          <Ionicons name={paused ? "play" : "pause"} size={isFullscreen ? 56 : 48} color="#fff" />
        </TouchableOpacity>
      ) : (
        <View style={styles.lockIconContainer}>
          <Ionicons name="lock-closed" size={isFullscreen ? 56 : 48} color="rgba(237, 236, 37, 0.7)" />
          <Text style={styles.lockText}>Terkunci</Text>
        </View>
      )}
    </View>
  );

  const renderBottomBar = () => (
    <View style={[styles.bottomBar, {
      paddingBottom: isFullscreen ? 20 : (insets.bottom || 12),
      paddingHorizontal: isFullscreen ? 20 : 16
    }]}>
      <TouchableOpacity onPress={handleLockToggle} style={[styles.bottomButton, isLocked && styles.activeBottomButton]}>
        <Ionicons name={isLocked ? "lock-closed" : "lock-open-outline"} size={isFullscreen ? 20 : 18} color={isLocked ? "#edec25" : "#fff"} />
        <Text style={[styles.bottomButtonText, isLocked && styles.activeBottomButtonText]}>{isLocked ? "Terkunci" : "Kunci"}</Text>
      </TouchableOpacity>

      {!isLocked && (
        <>
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, isBuffering && styles.liveDotBuffering]} />
            <Text style={styles.liveText}>LIVE</Text>
            {isBuffering && (
              <View style={styles.bufferingBadge}>
                <Text style={styles.bufferingBadgeText}>BUFFERING</Text>
              </View>
            )}
          </View>

          <View style={styles.rightControls}>
            <TouchableOpacity onPress={toggleAspectRatio} style={styles.bottomButton}>
              <MaterialCommunityIcons name="aspect-ratio" size={isFullscreen ? 20 : 18} color="#fff" />
              <Text style={styles.bottomButtonText}>
                {aspectRatio === ResizeMode.CONTAIN ? "Fit" :
                  aspectRatio === ResizeMode.COVER ? "Fill" : "Stretch"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onFullscreenChange(!isFullscreen)} style={styles.bottomButton}>
              <Ionicons name={isFullscreen ? "contract" : "expand"} size={isFullscreen ? 20 : 18} color="#fff" />
              <Text style={styles.bottomButtonText}>{isFullscreen ? "Exit" : "Full"}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <VideoPlayerWrapper
        ref={videoWrapperRef}
        url={currentUrl}
        paused={paused}
        onLoad={handleVideoLoad}
        onBuffer={handleBuffer}
        onProgress={handleProgress}
        onError={handleError}
        onEnd={handleEnd}
        onReadyForDisplay={handleReadyForDisplay}
        licenseType={licenseType}
        licenseKey={licenseKey}
        userAgent={userAgent}
        referrer={referrer}
        origin={origin}
        aspectRatio={aspectRatio}
        quality={quality}
      />

      <TouchableOpacity
        style={styles.touchOverlay}
        activeOpacity={1}
        onPress={handleTap}
      />

      {showControls && (
        <View style={styles.controlsOverlay}>
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'transparent', 'rgba(0,0,0,0.7)']}
            style={StyleSheet.absoluteFillObject}
          />
          {renderTopBar()}
          {renderMiddleControls()}
          {renderBottomBar()}
        </View>
      )}

      {loading && (
        <Animated.View style={[styles.loadingOverlay, { opacity: loadingOpacity }]}>
          <View style={styles.loadingContainer}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <MaterialCommunityIcons name="loading" size={40} color={Colors.primary || "#edec25"} />
            </Animated.View>
            <Animated.Text style={[styles.loadingText, { opacity: pulseValue }]}>
              {isBuffering ? 'Memuat stream...' : 'Menghubungkan...'}
            </Animated.Text>
            {bufferProgress > 0 && bufferProgress < 100 && (
              <View style={styles.bufferProgressWrapper}>
                <View style={styles.bufferProgressTrack}>
                  <View style={[styles.bufferProgressFill, { width: `${bufferProgress}%` }]} />
                </View>
                <Text style={styles.bufferPercent}>{Math.round(bufferProgress)}%</Text>
              </View>
            )}
            <Text style={styles.formatText}>
              {isDASH ? '🎬 DASH Stream' : isHLS ? '📡 HLS Stream' : `🎥 ${formatInfo.protocol.toUpperCase()}`}
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000'
  },
  touchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    zIndex: 20
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    minHeight: 56,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  backButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 8,
  },
  titleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    maxWidth: '35%',
  },
  formatBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 0.8,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 0.8,
  },
  qualityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  drmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(237, 236, 37, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 0.5,
    borderColor: '#edec25',
  },
  drmBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#edec25',
  },
  reloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  midControls: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  playPauseButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(237, 236, 37, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#edec25',
  },
  lockIconContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
  },
  lockText: {
    color: 'rgba(237, 236, 37, 0.7)',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    minHeight: 56,
  },
  bottomButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 6,
  },
  activeBottomButton: {
    backgroundColor: 'rgba(237, 236, 37, 0.2)',
    borderWidth: 0.5,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255,0,0,0.5)',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff0000',
  },
  liveDotBuffering: {
    backgroundColor: '#ff9800',
    opacity: 0.5,
  },
  liveText: {
    color: '#ff0000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  bufferingBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bufferingBadgeText: {
    color: '#ff9800',
    fontSize: 8,
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
    zIndex: 30,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 20,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  formatText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 4,
  },
  bufferProgressWrapper: {
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  bufferProgressTrack: {
    width: 140,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  bufferProgressFill: {
    height: '100%',
    backgroundColor: '#edec25',
    borderRadius: 2,
  },
  bufferPercent: {
    color: 'rgba(237, 236, 37, 0.8)',
    fontSize: 10,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    color: '#ff4444',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  errorButton: {
    backgroundColor: '#edec25',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  copyButton: {
    backgroundColor: '#333',
  },
  errorButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
});

export default VideoPlayer;