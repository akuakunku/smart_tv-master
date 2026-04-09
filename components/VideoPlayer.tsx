import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator, Text,
  Dimensions, AppState, AppStateStatus, Animated, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Video, { ResizeMode, OnBufferData, OnErrorData } from 'react-native-video';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { watchHistoryEvent } from '../utils/events';
import VideoPlayerWrapper from './VideoPlayerWrapper';

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
}

interface WatchHistoryItem { url: string; name: string; logo?: string; group?: string; timestamp: number; watchedAt: string; }

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const VideoPlayer: React.FC<Props> = ({ url, isFullscreen, onFullscreenChange, title, onReload, licenseType, licenseKey, userAgent, referrer, origin }) => {
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
    } catch (error) { console.error("❌ [HISTORY] Save error:", error); }
  }, []);

  useEffect(() => {
    Animated.loop(Animated.timing(spinValue, { toValue: 1, duration: 1000, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([Animated.timing(pulseValue, { toValue: 0.5, duration: 800, useNativeDriver: true }), Animated.timing(pulseValue, { toValue: 1, duration: 800, useNativeDriver: true })])).start();
  }, []);

  const spin = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const fadeOutLoading = useCallback(() => {
    Animated.timing(loadingOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => setLoading(false));
  }, [loadingOpacity]);

  const showLoading = useCallback(() => {
    setLoading(true);
    Animated.timing(loadingOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [loadingOpacity]);

  const checkInternetSpeed = useCallback(async () => {
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch('https://www.google.com/favicon.ico', { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      if (duration > 1500) setQuality('low');
      else if (duration > 700) setQuality('medium');
      else setQuality('high');
    } catch (error) { setQuality('medium'); }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') setPaused(false);
      else if (nextAppState === 'background') setPaused(true);
      appState.current = nextAppState;
    });
    checkInternetSpeed();
    return () => subscription.remove();
  }, [checkInternetSpeed]);

  const clearTimer = useCallback(() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } }, []);
  const startAutoHideTimer = useCallback(() => {
    clearTimer();
    if (showControls && !isLocked && !paused && !loading && !isBuffering) {
      timerRef.current = setTimeout(() => { setShowControls(false); timerRef.current = null; }, 4000);
    }
  }, [showControls, isLocked, paused, loading, isBuffering, clearTimer]);

  useEffect(() => {
    if (showControls && !isLocked && !paused && !loading && !isBuffering) startAutoHideTimer();
    else clearTimer();
    return () => clearTimer();
  }, [showControls, isLocked, paused, loading, isBuffering, startAutoHideTimer, clearTimer]);

  const startHealthCheck = useCallback(() => {
    if (healthCheckRef.current) clearTimeout(healthCheckRef.current);
    if (!isFirstLoad && !paused && !isBuffering && !loading) {
      healthCheckRef.current = setTimeout(() => {
        const now = Date.now();
        const timeSinceLastProgress = now - lastProgressTimeRef.current;
        const isReallyStuck = timeSinceLastProgress > 20000 && lastCurrentTimeRef.current === 0 && !isBuffering && !loading;
        if (isReallyStuck && !isManualReloadRef.current) {
          stuckCountRef.current++;
          if (stuckCountRef.current <= 3) {
            isManualReloadRef.current = true;
            setTimeout(() => { isManualReloadRef.current = false; if (stuckCountRef.current >= 3) stuckCountRef.current = 0; }, 3000);
          }
        } else if (timeSinceLastProgress > 5000 && lastCurrentTimeRef.current > 0) stuckCountRef.current = 0;
        startHealthCheck();
      }, 20000);
    }
  }, [isFirstLoad, paused, isBuffering, loading]);

  const stopHealthCheck = useCallback(() => { if (healthCheckRef.current) { clearTimeout(healthCheckRef.current); healthCheckRef.current = null; } }, []);
  useEffect(() => {
    if (!isFirstLoad && !paused && !isBuffering) startHealthCheck();
    else stopHealthCheck();
    return () => stopHealthCheck();
  }, [isFirstLoad, paused, isBuffering, startHealthCheck, stopHealthCheck]);

  const handleTap = useCallback(() => { clearTimer(); setShowControls(prev => !prev); }, [clearTimer]);
  const toggleAspectRatio = () => { const modes = [ResizeMode.CONTAIN, ResizeMode.COVER, ResizeMode.STRETCH]; const nextIndex = (modes.indexOf(aspectRatio) + 1) % modes.length; setAspectRatio(modes[nextIndex]); };
  const handlePlayPause = () => setPaused(!paused);
  const handleLockToggle = () => { clearTimer(); setIsLocked(prev => !prev); if (!isLocked) setShowControls(false); else setShowControls(true); };
  const handleReload = () => { clearTimer(); isManualReloadRef.current = true; stuckCountRef.current = 0; showLoading(); if (onReload) onReload(); setTimeout(() => { isManualReloadRef.current = false; }, 2000); };

  const handleVideoLoad = useCallback(() => {
    setIsFirstLoad(false); setShowControls(true); fadeOutLoading(); lastProgressTimeRef.current = Date.now(); stuckCountRef.current = 0;
    if (!hasSavedHistoryRef.current && title) { hasSavedHistoryRef.current = true; saveToWatchHistory({ url, name: title }); }
  }, [fadeOutLoading, title, url, saveToWatchHistory]);

  const handleBuffer = ({ isBuffering: buffering }: OnBufferData) => {
    if (buffering) { setIsBuffering(true); if (!isFirstLoad) showLoading(); }
    else { setIsBuffering(false); if (!isFirstLoad) { fadeOutLoading(); lastProgressTimeRef.current = Date.now(); } }
  };

  const handleProgress = (data: any) => {
    if (data.currentTime) {
      const now = Date.now();
      const currentTimeDiff = Math.abs(data.currentTime - lastCurrentTimeRef.current);
      lastProgressTimeRef.current = now;
      lastCurrentTimeRef.current = data.currentTime;
      if (data.playableDuration && data.currentTime) {
        const buffered = data.playableDuration - data.currentTime;
        const totalBuffer = data.playableDuration;
        if (totalBuffer > 0) setBufferProgress(Math.min((buffered / totalBuffer) * 100, 100));
      }
      if (currentTimeDiff > 0.1) stuckCountRef.current = 0;
    }
  };

  const handleError = useCallback((error: OnErrorData) => {
  console.log('❌ [VIDEO] Error:', error);
  
  // Jangan langsung fadeOutLoading, biarkan auto-reconnect bekerja
  if (error.error?.code === -1009 || error.error?.code === -1005) {
    console.log('🌐 [NETWORK] Network error, will auto-reconnect...');
  } else {
    // Hanya untuk error fatal
    fadeOutLoading();
    setIsBuffering(false);
  }
}, [fadeOutLoading]);



  const handleEnd = () => { if (!isFirstLoad && !isManualReloadRef.current) setTimeout(() => handleReload(), 1000); };
    console.log('🏁 [VIDEO] Stream ended, auto-reconnecting...');

  const handleReadyForDisplay = () => { fadeOutLoading(); setIsBuffering(false); };

  useEffect(() => { hasSavedHistoryRef.current = false; }, [url]);
  useEffect(() => { return () => { if (timerRef.current) clearTimeout(timerRef.current); if (healthCheckRef.current) clearTimeout(healthCheckRef.current); }; }, []);

  const renderQualityBadge = () => {
    let icon = '', text = '', color = '';
    switch (quality) {
      case 'low': icon = "signal-cellular-1"; text = "Slow"; color = "#ff9800"; break;
      case 'medium': icon = "signal-cellular-2"; text = "Normal"; color = "#4caf50"; break;
      case 'high': icon = "signal-cellular-3"; text = "Fast"; color = "#2196f3"; break;
      default: return null;
    }
    return (
      <View style={[styles.qualityBadge, { borderColor: color }]}>
        <MaterialCommunityIcons name={icon as any} size={10} color={color} />
        <Text style={[styles.qualityText, { color }]}>{text}</Text>
      </View>
    );
  };

  const renderTopBar = () => (
    <View style={[styles.topBar, { paddingTop: isFullscreen ? 20 : Math.max(insets.top, 10), paddingHorizontal: isFullscreen ? 20 : 12 }]}>
      {isFullscreen && <TouchableOpacity onPress={() => onFullscreenChange(false)} style={styles.backButton}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>}
      {!isFullscreen && <View style={styles.backButtonPlaceholder} />}
      <View style={styles.titleContainer}>
        <Text style={styles.titleText} numberOfLines={1}>{isLocked ? "🔒 Layar Terkunci" : (title || "Streaming Live")}</Text>
        {renderQualityBadge()}
        {licenseType && (
          <View style={styles.drmBadge}><Text style={styles.drmBadgeText}>{licenseType === 'com.widevine.alpha' ? '🔒 Widevine' : licenseType === 'clearkey' ? '🔓 ClearKey' : '🔐 DRM'}</Text></View>
        )}
      </View>
      {!isLocked && <TouchableOpacity onPress={handleReload} style={styles.reloadButton}><MaterialCommunityIcons name="reload" size={20} color="#fff" /></TouchableOpacity>}
    </View>
  );

  const renderMiddleControls = () => (
    <View style={styles.midControls}>
      {!isLocked ? (
        <TouchableOpacity onPress={handlePlayPause} style={styles.playPauseButton} activeOpacity={0.8}>
          <Ionicons name={paused ? "play" : "pause"} size={isFullscreen ? 50 : 40} color="#fff" />
        </TouchableOpacity>
      ) : (
        <View style={styles.lockIconContainer}>
          <Ionicons name="lock-closed" size={isFullscreen ? 50 : 40} color="rgba(237, 236, 37, 0.6)" />
          <Text style={styles.lockText}>Terkunci</Text>
        </View>
      )}
    </View>
  );

  const renderBottomBar = () => (
    <View style={[styles.bottomBar, { paddingBottom: isFullscreen ? 20 : (insets.bottom || 10), paddingHorizontal: isFullscreen ? 20 : 12 }]}>
      <TouchableOpacity onPress={handleLockToggle} style={[styles.bottomButton, isLocked && styles.activeBottomButton]}>
        <Ionicons name={isLocked ? "lock-closed" : "lock-open-outline"} size={isFullscreen ? 18 : 16} color={isLocked ? "#edec25" : "#fff"} />
        <Text style={[styles.bottomButtonText, isLocked && styles.activeBottomButtonText]}>{isLocked ? "Terkunci" : "Kunci"}</Text>
      </TouchableOpacity>
      {!isLocked && (
        <>
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, isBuffering && styles.liveDotBuffering]} />
            <Text style={styles.liveText}>LIVE</Text>
            {isBuffering && <View style={styles.bufferingBadge}><Text style={styles.bufferingBadgeText}>BUFFERING</Text></View>}
          </View>
          <View style={styles.rightControls}>
            <TouchableOpacity onPress={toggleAspectRatio} style={styles.bottomButton}>
              <MaterialCommunityIcons name="aspect-ratio" size={isFullscreen ? 18 : 16} color="#fff" />
              <Text style={styles.bottomButtonText}>{aspectRatio === ResizeMode.CONTAIN ? "Fit" : aspectRatio === ResizeMode.COVER ? "Fill" : "Stretch"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onFullscreenChange(!isFullscreen)} style={styles.bottomButton}>
              <Ionicons name={isFullscreen ? "contract" : "expand"} size={isFullscreen ? 18 : 16} color="#fff" />
              <Text style={styles.bottomButtonText}>{isFullscreen ? "Exit" : "Full"}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <VideoPlayerWrapper url={url} paused={paused} onLoad={handleVideoLoad} onBuffer={handleBuffer} onProgress={handleProgress} onError={handleError} onEnd={handleEnd} onReadyForDisplay={handleReadyForDisplay} licenseType={licenseType} licenseKey={licenseKey} userAgent={userAgent} referrer={referrer} origin={origin} aspectRatio={aspectRatio} quality={quality} />
      <TouchableOpacity style={styles.touchOverlay} activeOpacity={1} onPress={handleTap} />
      {showControls && (
        <View style={styles.controlsOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.8)', 'transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFillObject} />
          {renderTopBar()}{renderMiddleControls()}{renderBottomBar()}
        </View>
      )}
      {loading && (
        <Animated.View style={[styles.loadingOverlay, { opacity: loadingOpacity }]}>
          <View style={styles.loadingContainer}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}><MaterialCommunityIcons name="loading" size={36} color="rgba(237, 236, 37, 0.9)" /></Animated.View>
            <Animated.Text style={[styles.loadingText, { opacity: pulseValue }]}>{isBuffering ? 'Memuat stream...' : 'Menghubungkan...'}</Animated.Text>
            {bufferProgress > 0 && bufferProgress < 100 && (
              <View style={styles.bufferProgressWrapper}>
                <View style={styles.bufferProgressTrack}><View style={[styles.bufferProgressFill, { width: `${bufferProgress}%` }]} /></View>
                <Text style={styles.bufferPercent}>{Math.round(bufferProgress)}%</Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  touchOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', zIndex: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  backButtonPlaceholder: { width: 36, height: 36 },
  titleContainer: { flex: 1, marginHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  titleText: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  qualityBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, gap: 3, borderWidth: 0.5 },
  qualityText: { fontSize: 8, fontWeight: '600' },
  drmBadge: { backgroundColor: 'rgba(237, 236, 37, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 0.5, borderColor: '#edec25' },
  drmBadgeText: { fontSize: 8, fontWeight: '600', color: '#edec25' },
  reloadButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  midControls: { alignItems: 'center', justifyContent: 'center' },
  playPauseButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(237, 236, 37, 0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#edec25' },
  lockIconContainer: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25 },
  lockText: { color: 'rgba(237, 236, 37, 0.6)', fontSize: 11, marginTop: 6 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  bottomButton: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, flexDirection: 'row', gap: 4 },
  activeBottomButton: { backgroundColor: 'rgba(237, 236, 37, 0.2)', borderWidth: 0.5, borderColor: '#edec25' },
  bottomButtonText: { color: '#fff', fontSize: 10, fontWeight: '500' },
  activeBottomButtonText: { color: '#edec25' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(255,0,0,0.5)', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff0000' },
  liveDotBuffering: { backgroundColor: '#ff9800', opacity: 0.5 },
  liveText: { color: '#ff0000', fontSize: 10, fontWeight: 'bold' },
  bufferingBadge: { backgroundColor: 'rgba(255, 152, 0, 0.3)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  bufferingBadgeText: { color: '#ff9800', fontSize: 7, fontWeight: 'bold' },
  rightControls: { flexDirection: 'row', gap: 8 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 30 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 11, fontWeight: '500', letterSpacing: 0.3, textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  bufferProgressWrapper: { alignItems: 'center', gap: 3, marginTop: 2 },
  bufferProgressTrack: { width: 80, height: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1, overflow: 'hidden' },
  bufferProgressFill: { height: '100%', backgroundColor: '#edec25', borderRadius: 1 },
  bufferPercent: { color: 'rgba(237, 236, 37, 0.8)', fontSize: 9, fontWeight: '600' },
});

export default VideoPlayer;