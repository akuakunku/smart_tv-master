// components/VideoPlayerWrapper.tsx
import React, { useRef, useMemo, useState, useCallback, useEffect, forwardRef } from 'react';
import { View, Platform, Text, StyleSheet } from 'react-native';
import Video, { 
  ResizeMode, 
  OnLoadData, 
  OnErrorData, 
  OnBufferData, 
  OnProgressData 
} from 'react-native-video';

interface VideoPlayerWrapperProps {
  url: string;
  paused: boolean;
  onLoad: (data?: OnLoadData) => void;
  onBuffer: (data: OnBufferData) => void;
  onProgress: (data: OnProgressData) => void;
  onError: (error: OnErrorData) => void;
  onEnd: () => void;
  onReadyForDisplay: () => void;
  licenseType?: string | null;
  licenseKey?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  origin?: string | null;
  aspectRatio: ResizeMode;
  quality: 'auto' | 'low' | 'medium' | 'high';
}

const VideoPlayerWrapper = forwardRef<Video, VideoPlayerWrapperProps>((props, ref) => {
  const internalRef = useRef<Video>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showError, setShowError] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const [useFallback, setUseFallback] = useState(false);
  const mountedRef = useRef(true);
  const lastErrorTimeRef = useRef(0);
  const [fatalErrorDetected, setFatalErrorDetected] = useState(false);
  const [isMalformedManifest, setIsMalformedManifest] = useState(false);
  const [httpErrorCode, setHttpErrorCode] = useState<number | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

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

  React.useImperativeHandle(ref, () => internalRef.current as Video);

  const isLive = useMemo(() => {
    return url.includes('.m3u8') || url.includes('.mpd') || url.includes('live');
  }, [url]);

  const isDASH = useMemo(() => url.toLowerCase().includes('.mpd'), [url]);
  const isHLS = useMemo(() => url.toLowerCase().includes('.m3u8'), [url]);
  
  const isEncrypted = useMemo(() => {
    const urlLower = url.toLowerCase();
    return urlLower.includes('cenc') || urlLower.includes('/enc/') || urlLower.includes('encrypted');
  }, [url]);
  
  const needsDrmLicense = useMemo(() => {
    if (!isDASH) return false;
    if (isEncrypted && (!licenseType || !licenseKey)) {
      console.log('⚠️ [WRAPPER] Encrypted DASH stream requires DRM license');
      return true;
    }
    return false;
  }, [isDASH, isEncrypted, licenseType, licenseKey]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Reset state when URL changes
  useEffect(() => {
    setRetryCount(0);
    setShowError(false);
    setUseFallback(false);
    setFatalErrorDetected(false);
    setIsMalformedManifest(false);
    setHttpErrorCode(null);
    setPlayerKey(prev => prev + 1);
    
    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = undefined;
    }
  }, [url]);

  const isValidLicenseUrl = (licenseUrl: string): boolean => {
    if (!licenseUrl) return false;
    try {
      const urlObj = new URL(licenseUrl);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const drmConfig = useMemo(() => {
    if (!isDASH) return {};
    if (needsDrmLicense) return {};

    let extractedLicenseType = licenseType;
    let extractedLicenseKey = licenseKey;

    if (url.includes('|')) {
      const paramsPart = url.split('|')[1];
      const params = new URLSearchParams(paramsPart);
      if (!extractedLicenseType && params.get('license_type')) {
        extractedLicenseType = params.get('license_type');
      }
      if (!extractedLicenseKey && params.get('license_key')) {
        extractedLicenseKey = decodeURIComponent(params.get('license_key') || '');
      }
    }

    if (!extractedLicenseType || !extractedLicenseKey) {
      console.log('🎬 [DRM] No license info, trying without DRM');
      return {};
    }

    // Untuk ClearKey dengan format key:iv (seperti di playlist Anda)
    if (extractedLicenseType === 'clearkey' || extractedLicenseType === 'org.w3.clearkey') {
      console.log('🔓 [DRM] Configuring ClearKey DRM');
      
      // Cek apakah licenseKey adalah format key:iv (ClearKey standard)
      if (extractedLicenseKey.includes(':')) {
        return {
          drm: {
            type: 'clearkey',
            licenseKey: extractedLicenseKey, // Format: "key:iv"
          },
        };
      }
      
      // Jika URL, gunakan sebagai license server
      if (isValidLicenseUrl(extractedLicenseKey)) {
        return {
          drm: {
            type: 'clearkey',
            licenseServer: extractedLicenseKey,
          },
        };
      }
      
      return {};
    }

    if (extractedLicenseType === 'com.widevine.alpha' || extractedLicenseType === 'widevine') {
      console.log('🔒 [DRM] Configuring Widevine DRM');
      return {
        drm: {
          type: 'widevine',
          licenseServer: extractedLicenseKey,
          headers: {
            'User-Agent': userAgent || 'ExoPlayer',
            'Content-Type': 'application/octet-stream',
          },
        },
      };
    }

    return {};
  }, [licenseType, licenseKey, userAgent, url, isDASH, needsDrmLicense]);

  const bufferConfig = undefined;

  const source = useMemo(() => {
    const headers: Record<string, string> = {
      'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
    };

    if (referrer) headers['Referer'] = referrer;
    if (origin) headers['Origin'] = origin;

    if (url.includes('|')) {
      const paramsPart = url.split('|')[1];
      const params = new URLSearchParams(paramsPart);
      for (const [key, value] of params.entries()) {
        const lowerKey = key.toLowerCase();
        if (!['license_type', 'license_key', 'user-agent', 'referer', 'origin'].includes(lowerKey)) {
          headers[key] = decodeURIComponent(value);
        }
      }
    }

    const cleanUrl = url.split('|')[0];
    const type = isDASH ? 'mpd' : isHLS ? 'm3u8' : undefined;

    return { uri: cleanUrl, headers, type };
  }, [url, userAgent, referrer, origin, isDASH, isHLS]);

  const handleLoad = useCallback((data: OnLoadData) => {
    if (!mountedRef.current) return;
    
    let duration = data?.duration ?? 0;
    if (duration < 0 || duration > 864000) {
      duration = 0;
      console.log('⚠️ [WRAPPER] Invalid duration detected, using 0');
    }
    
    const loadData = {
      ...data,
      duration: duration,
      naturalSize: data?.naturalSize || { width: 0, height: 0 }
    };
    
    console.log(`✅ [WRAPPER] Loaded - Duration: ${duration}s`);
    setRetryCount(0);
    setShowError(false);
    setUseFallback(false);
    setFatalErrorDetected(false);
    setIsMalformedManifest(false);
    setHttpErrorCode(null);
    
    props.onLoad(loadData);
  }, [props.onLoad]);

  const scheduleRetry = useCallback((delay: number) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    retryTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setPlayerKey(prev => prev + 1);
      }
      retryTimeoutRef.current = undefined;
    }, delay);
  }, []);

  const handleError = useCallback((error: OnErrorData) => {
    if (!mountedRef.current) return;

    const errorString = error.error?.errorString || '';
    const errorException = error.error?.errorException || '';
    const fullError = `${errorString} ${errorException}`;
    
    console.error(`❌ [WRAPPER] Error:`, fullError);

    const now = Date.now();
    const timeSinceLastError = now - lastErrorTimeRef.current;
    lastErrorTimeRef.current = now;

    // Hindari error loop
    if (timeSinceLastError < 1000) return;

    // Deteksi HTTP Error Codes
    const httpCodeMatch = fullError.match(/HTTP\s+(\d{3})/) || 
                          fullError.match(/status\s+(\d{3})/i) ||
                          fullError.match(/ERROR_CODE_IO_BAD_HTTP_STATUS.*?(\d{3})/);
    const httpCode = httpCodeMatch ? parseInt(httpCodeMatch[1]) : null;

    // 404 - Stream not found (FATAL)
    if (httpCode === 404) {
      console.log('📛 [WRAPPER] Stream not found (404)');
      setHttpErrorCode(404);
      setFatalErrorDetected(true);
      setShowError(true);
      props.onError(error);
      return;
    }

    // 403 - Forbidden (FATAL)
    if (httpCode === 403) {
      console.log('🚫 [WRAPPER] Access forbidden (403)');
      setHttpErrorCode(403);
      setFatalErrorDetected(true);
      setShowError(true);
      props.onError(error);
      return;
    }

    // Fatal errors
    const isFatal = fullError.includes('Current Activity is null') ||
                    fullError.includes('Failed to initialize Player') ||
                    fullError.includes('IllegalStateException') ||
                    fullError.includes('Out of range') || // ✅ Tambahan untuk error buffer
                    error.error?.code === 1001;
    
    if (isFatal) {
      console.log('💀 [WRAPPER] Fatal error detected, cannot recover');
      setFatalErrorDetected(true);
      setShowError(true);
      props.onError(error);
      return;
    }
    
    // Malformed manifest
    const isMalformed = fullError.includes('ERROR_CODE_PARSING_MANIFEST_MALFORMED') ||
                        fullError.includes('Manifest malformed') ||
                        fullError.includes('Invalid manifest');
    
    if (isMalformed) {
      console.log('📄 [WRAPPER] Malformed manifest detected');
      setIsMalformedManifest(true);
      setShowError(true);
      props.onError(error);
      return;
    }
    
    // DRM Error
    const isDrmError = errorString.includes('DRM') || errorString.includes('drm') ||
                       errorString.includes('license') || errorString.includes('MediaDrm') ||
                       error.error?.code === 'ERROR_CODE_DRM_LICENSE_ACQUISITION_FAILED' ||
                       error.error?.code === 26004;

    // Network Error
    const isNetworkError = errorString.includes('network') || errorString.includes('timeout') ||
                          errorString.includes('connection') || error.error?.code === -1009 ||
                          error.error?.code === -1005 || error.error?.code === -1001;

    // Server error 5xx - retry
    if (httpCode && httpCode >= 500 && retryCount < 3) {
      console.log(`🔄 [WRAPPER] Server error ${httpCode}, retry ${retryCount + 1}/3`);
      setRetryCount(prev => prev + 1);
      scheduleRetry(Math.min(2000 * Math.pow(2, retryCount), 10000));
      return;
    }

    // DRM error - fallback
    if (isDrmError) {
      console.log('🔒 [WRAPPER] DRM error detected');
      if (!useFallback && retryCount < 2 && isDASH && !isEncrypted) {
        console.log('🔄 [WRAPPER] Retrying without DRM...');
        setUseFallback(true);
        setRetryCount(prev => prev + 1);
        scheduleRetry(1000);
        return;
      }
      setShowError(true);
      props.onError(error);
      return;
    }

    // Network error - retry
    if (isNetworkError && retryCount < 3) {
      console.log(`🔄 [WRAPPER] Network error, retry ${retryCount + 1}/3`);
      setRetryCount(prev => prev + 1);
      scheduleRetry(Math.min(2000 * Math.pow(2, retryCount), 10000));
      return;
    }

    // General error - limited retry
    if (retryCount < 2) {
      console.log(`🔄 [WRAPPER] General error, retry ${retryCount + 1}/2`);
      setRetryCount(prev => prev + 1);
      scheduleRetry(2000);
      return;
    }

    if (!showError) {
      setShowError(true);
      props.onError(error);
    }
  }, [retryCount, useFallback, props.onError, isDASH, isEncrypted, scheduleRetry]);

  const handleBuffer = useCallback((data: OnBufferData) => {
    if (mountedRef.current) props.onBuffer(data);
  }, [props.onBuffer]);

  const handleProgress = useCallback((data: OnProgressData) => {
    props.onProgress(data);
  }, [props.onProgress]);

  const handleEnd = useCallback(() => {
    if (isLive) {
      scheduleRetry(2000);
    } else {
      props.onEnd();
    }
  }, [isLive, props.onEnd, scheduleRetry]);

  const handleReadyForDisplay = useCallback(() => {
    props.onReadyForDisplay();
  }, [props.onReadyForDisplay]);

  // Error UI
  if (needsDrmLicense) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>🔒</Text>
        <Text style={styles.errorTitle}>Stream Dilindungi DRM</Text>
        <Text style={styles.errorMessage}>Stream ini menggunakan enkripsi DRM dan memerlukan lisensi yang valid.</Text>
        <Text style={styles.errorHint}>Coba channel lain</Text>
      </View>
    );
  }

  if (showError) {
    let errorMessage = '';
    if (httpErrorCode === 404) {
      errorMessage = 'Stream tidak ditemukan (404). Mungkin channel sudah tidak tersedia.';
    } else if (httpErrorCode === 403) {
      errorMessage = 'Akses ditolak (403). Server memblokir pemutaran ini.';
    } else if (isMalformedManifest) {
      errorMessage = 'URL ini adalah file playlist, bukan stream video';
    } else if (fatalErrorDetected) {
      errorMessage = 'Terjadi kesalahan pada pemutar video';
    } else if (isDASH && isEncrypted) {
      errorMessage = 'Stream DASH terenkripsi tidak dapat diputar';
    } else if (isDASH && (!licenseType || !licenseKey)) {
      errorMessage = 'Stream DASH memerlukan lisensi DRM';
    } else {
      errorMessage = 'Format video tidak didukung';
    }

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Tidak Dapat Memutar Stream</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <Text style={styles.errorHint}>Coba channel lain</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Video
        key={`${playerKey}-${useFallback ? 'noderm' : 'drm'}`}
        ref={internalRef}
        source={source}
        style={styles.video}
        resizeMode={aspectRatio}
        paused={paused}
        onLoad={handleLoad}
        onBuffer={handleBuffer}
        onProgress={handleProgress}
        onError={handleError}
        onEnd={handleEnd}
        onReadyForDisplay={handleReadyForDisplay}
        progressUpdateInterval={0}
        maxBitRate={quality === 'low' ? 1000000 : quality === 'medium' ? 2500000 : quality === 'high' ? 5000000 : undefined}
        {...(useFallback ? {} : drmConfig)}
        {...(Platform.OS === 'android' && {
          audioFocusType: 'gain',
          disableFocus: false,
          reportBandwidth: true,
        })}
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
      />
    </View>
  );
});

VideoPlayerWrapper.displayName = 'VideoPlayerWrapper';

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  video: { 
    flex: 1 
  },
  errorContainer: { 
    flex: 1, 
    backgroundColor: '#000', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  errorIcon: { 
    fontSize: 48, 
    marginBottom: 16 
  },
  errorTitle: { 
    color: '#ff4444', 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginBottom: 8 
  },
  errorMessage: { 
    color: '#888', 
    fontSize: 14, 
    textAlign: 'center', 
    marginBottom: 8 
  },
  errorHint: { 
    color: '#666', 
    fontSize: 12, 
    textAlign: 'center' 
  },
});

export default VideoPlayerWrapper;