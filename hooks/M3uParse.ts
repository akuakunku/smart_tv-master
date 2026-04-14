import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios, { CancelTokenSource } from "axios";

export interface Channel {
  tvgId: string | null;
  tvgName: string | null;
  name: string;
  url: string;
  group: string;
  logo: string | null;
  userAgent: string;
  referrer: string | null;
  origin?: string | null;
  licenseType?: string | null;
  licenseKey?: string | null;
  audioTrack?: string | null;
  httpHeaders?: Record<string, string> | null;
  catchupSource?: string | null;
  catchupId?: string | null;
  timeshift?: string | null;
  isDASH: boolean;
  isHLS: boolean;
  isEncrypted: boolean;
  kodiprops?: Record<string, string>;
}

export interface M3uParseResult {
  channels: Channel[];
  groups: string[];
  totalDuration?: number;
  hasCatchup: boolean;
}

export const getChannelHeaders = (channel: Channel) => {
  const headers: Record<string, string> = {
    'User-Agent': channel.userAgent || 'VLC/3.0.11 LibVLC/3.0.11',
  };

  if (channel.referrer) {
    headers['Referer'] = channel.referrer;
  }

  if (channel.origin) {
    headers['Origin'] = channel.origin;
  }

  if (channel.httpHeaders) {
    Object.assign(headers, channel.httpHeaders);
  }

  return headers;
};

export const isValidLicenseUrl = (licenseKey: string | null | undefined): boolean => {
  if (!licenseKey) return false;
  try {
    const url = new URL(licenseKey);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const isPlaylistUrl = (url: string): boolean => {
  const urlLower = url.toLowerCase();
  
  if (urlLower.endsWith('.m3u') || urlLower.endsWith('.m3u8')) {
    if (urlLower.includes('raw.githubusercontent.com') || 
        urlLower.includes('pastebin.com') ||
        urlLower.includes('gist.github.com')) {
      return true;
    }
    
    if (urlLower.includes('playlist') || 
        urlLower.includes('channel') ||
        urlLower.includes('list')) {
      return true;
    }
  }
  
  return false;
};

export const isEncryptedStream = (url: string): boolean => {
  const urlLower = url.toLowerCase();
  return urlLower.includes('cenc') || 
         urlLower.includes('/enc/') ||
         urlLower.includes('encrypted') ||
         urlLower.includes('widevine') ||
         urlLower.includes('clearkey');
};

export const isChannelPlayable = (channel: Channel): boolean => {
  if (channel.isHLS) return true;
  if (!channel.isDASH && !channel.isHLS) return true;
  
  if (channel.isDASH) {
    if (channel.isEncrypted) {
      const hasLicense = channel.licenseType && channel.licenseKey;
      if (!hasLicense) {
        console.log(`⚠️ [M3U] Encrypted DASH without license, skipping: ${channel.name}`);
        return false;
      }
      if (!isValidLicenseUrl(channel.licenseKey)) {
        console.log(`⚠️ [M3U] Invalid license URL for encrypted DASH: ${channel.name}`);
        return false;
      }
      return true;
    }
    
    const hasLicense = channel.licenseType && channel.licenseKey;
    if (!hasLicense) {
      console.log(`⚠️ [M3U] DASH without license, skipping: ${channel.name}`);
      return false;
    }
    
    return isValidLicenseUrl(channel.licenseKey);
  }
  
  return true;
};

export const isValidStreamUrl = (url: string): boolean => {
  if (!url || url.length < 10) return false;
  if (url.includes('///')) return false;
  
  if (isPlaylistUrl(url)) {
    console.log(`⚠️ [M3U] Skipping playlist URL: ${url.substring(0, 80)}`);
    return false;
  }
  
  if (url.includes('raw.githubusercontent.com')) return false;
  if (url.includes('pastebin.com')) return false;
  
  const urlLower = url.toLowerCase();
  const hasValidFormat = urlLower.includes('.m3u8') || 
                         urlLower.includes('.mpd') || 
                         urlLower.includes('.mp4') || 
                         urlLower.includes('.ts') ||
                         urlLower.includes('.mkv') ||
                         urlLower.includes('.webm') ||
                         urlLower.includes('.flv');
  
  if (!hasValidFormat) return false;
  
  try {
    const urlObj = new URL(url.split('|')[0]);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:' ||
           urlObj.protocol === 'rtmp:' || urlObj.protocol === 'rtsp:';
  } catch {
    return false;
  }
};

interface CacheData {
  channels: Channel[];
  groups: string[];
  timestamp: number;
  version: number;
}

const DEFAULT_M3U_URLS = [
  { name: "Backup", url: "https://raw.githubusercontent.com/chesko21/tv-online-m3u/refs/heads/my-repo/Playlist.m3u", enabled: false },
  { name: "Backup1", url: "https://raw.githubusercontent.com/mimipipi22/lalajo/refs/heads/main/playlist25", enabled: true }
];

const CACHE_KEY = "m3u_channels_cache";
const USER_M3U_URLS_KEY = "user_m3u_urls";
const ACTIVE_URL_KEY = "active_m3u_url";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 3;

const useM3uParse = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [userUrls, setUserUrls] = useState<string[]>([]);

  const fetchInProgressRef = useRef<boolean>(false);
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const isValidUrl = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:' ||
        urlObj.protocol === 'rtmp:' || urlObj.protocol === 'rtsp:';
    } catch {
      return false;
    }
  }, []);

  const parseExtinfAttributes = useCallback((line: string): Record<string, string> => {
    const attributes: Record<string, string> = {};
    const quotedPattern = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    let match;

    while ((match = quotedPattern.exec(line)) !== null) {
      attributes[match[1]] = match[2];
    }

    const unquotedPattern = /([a-zA-Z0-9_-]+)=([^,"\s]+)/g;
    while ((match = unquotedPattern.exec(line)) !== null) {
      if (!attributes[match[1]]) {
        attributes[match[1]] = match[2];
      }
    }

    return attributes;
  }, []);

  const cleanChannelName = useCallback((name: string): string => {
    let cleaned = name
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned || cleaned.length === 0) {
      cleaned = "Unknown Channel";
    }

    return cleaned;
  }, []);

  const parseUrlParameters = useCallback((urlWithParams: string): {
    cleanUrl: string;
    params: URLSearchParams;
  } => {
    if (urlWithParams.includes('|')) {
      const parts = urlWithParams.split('|');
      const cleanUrl = parts[0].trim();
      const paramsString = parts[1];
      const params = new URLSearchParams(paramsString);
      return { cleanUrl, params };
    }
    return { cleanUrl: urlWithParams, params: new URLSearchParams() };
  }, []);

  const detectStreamType = useCallback((url: string): { isDASH: boolean; isHLS: boolean; isEncrypted: boolean } => {
    const lowerUrl = url.toLowerCase();
    return {
      isDASH: lowerUrl.includes('.mpd') || lowerUrl.includes('manifest.mpd'),
      isHLS: lowerUrl.includes('.m3u8') || lowerUrl.includes('index.m3u8'),
      isEncrypted: isEncryptedStream(url)
    };
  }, []);

  const parseM3uBody = useCallback((data: string): M3uParseResult => {
    const lines = data.split(/\r?\n/);
    const result: Channel[] = [];
    let currentMeta: Partial<Channel> | null = null;
    let currentKodiprops: Record<string, string> = {};
    let pendingLicenseType: string | null = null;
    let pendingLicenseKey: string | null = null;
    let pendingAudioTrack: string | null = null;
    let totalDuration = 0;
    let hasCatchup = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("#KODIPROP:")) {
        const kodipropMatch = line.match(/#KODIPROP:(.+?)=(.+)/);
        if (kodipropMatch) {
          const key = kodipropMatch[1].trim();
          const value = kodipropMatch[2].trim();

          currentKodiprops[key] = value;

          switch (key) {
            case 'inputstream.adaptive.license_type':
              pendingLicenseType = value;
              break;
            case 'inputstream.adaptive.license_key':
              pendingLicenseKey = value;
              break;
            case 'inputstream.adaptive.audio_track':
              pendingAudioTrack = value;
              break;
          }
        }
        continue;
      }
      
      if (line === "#EXTM3U") {
        continue;
      }

      if (line.startsWith("#EXTINF:")) {
        const durationMatch = line.match(/#EXTINF:([\d\.\-]+)/);
        if (durationMatch) {
          const duration = parseFloat(durationMatch[1]);
          if (duration > 0) totalDuration += duration;
        }

        const attributes = parseExtinfAttributes(line);

        let group = attributes['group-title'] || "Lainnya";
        if (!group && attributes['group']) group = attributes['group'];
        if (!group && attributes['group_name']) group = attributes['group_name'];

        const lastCommaIndex = line.lastIndexOf(",");
        let channelName = lastCommaIndex !== -1 ? line.substring(lastCommaIndex + 1).trim() : "Unknown Channel";
        channelName = cleanChannelName(channelName);

        const catchupSource = attributes['catchup-source'] || null;
        const catchupId = attributes['catchup-id'] || null;
        const timeshift = attributes['timeshift'] || null;

        if (catchupSource || catchupId) hasCatchup = true;

        currentMeta = {
          tvgId: attributes['tvg-id'] || attributes['tvg_id'] || null,
          tvgName: attributes['tvg-name'] || attributes['tvg_name'] || channelName,
          name: channelName,
          logo: attributes['tvg-logo'] || attributes['tvg_logo'] || null,
          group: group,
          catchupSource: catchupSource,
          catchupId: catchupId,
          timeshift: timeshift,
          userAgent: "VLC/3.0.11 LibVLC/3.0.11",
          referrer: null,
          origin: null,
          kodiprops: { ...currentKodiprops }
        };

        continue;
      }

      const urlMatch = line.match(/^(https?:\/\/|rtsp:\/\/|rtmp:\/\/)/i);
      if (urlMatch || (currentMeta && (line.includes('.mpd') || line.includes('.m3u8')))) {
        if (currentMeta) {
          let streamUrl = line;
          let userAgent = currentMeta.userAgent || "VLC/3.0.11 LibVLC/3.0.11";
          let referrer = currentMeta.referrer || null;
          let origin = currentMeta.origin || null;
          let licenseType = pendingLicenseType;
          let licenseKey = pendingLicenseKey;
          let audioTrack = pendingAudioTrack;
          let httpHeaders: Record<string, string> | null = null;

          const { cleanUrl, params } = parseUrlParameters(streamUrl);
          streamUrl = cleanUrl;

          const uaMatch = params.get('User-Agent');
          if (uaMatch) userAgent = decodeURIComponent(uaMatch);

          const refMatch = params.get('Referer');
          if (refMatch) referrer = decodeURIComponent(refMatch);

          const originMatch = params.get('Origin');
          if (originMatch) origin = decodeURIComponent(originMatch);

          const licTypeMatch = params.get('license_type');
          if (licTypeMatch) licenseType = licTypeMatch;

          const licKeyMatch = params.get('license_key');
          if (licKeyMatch) licenseKey = decodeURIComponent(licKeyMatch);

          if (licenseKey && licenseKey.includes('clearkey-base64-2-hex-json.herokuapp.com')) {
            licenseType = 'clearkey';
          }

          httpHeaders = {};
          for (const [key, value] of params.entries()) {
            const lowerKey = key.toLowerCase();
            if (lowerKey !== 'user-agent' &&
              lowerKey !== 'referer' &&
              lowerKey !== 'origin' &&
              lowerKey !== 'license_type' &&
              lowerKey !== 'license_key') {
              httpHeaders[key] = decodeURIComponent(value);
            }
          }

          const { isDASH, isHLS, isEncrypted } = detectStreamType(streamUrl);

          if (!licenseType && currentKodiprops['inputstream.adaptive.license_type']) {
            licenseType = currentKodiprops['inputstream.adaptive.license_type'];
          }
          if (!licenseKey && currentKodiprops['inputstream.adaptive.license_key']) {
            licenseKey = currentKodiprops['inputstream.adaptive.license_key'];
          }

          const channelToAdd = {
            ...(currentMeta as Channel),
            url: streamUrl,
            userAgent,
            referrer,
            origin,
            licenseType: licenseType || null,
            licenseKey: licenseKey || null,
            audioTrack: audioTrack || null,
            httpHeaders: Object.keys(httpHeaders || {}).length ? httpHeaders! : null,
            isDASH,
            isHLS,
            isEncrypted,
            kodiprops: Object.keys(currentKodiprops).length ? currentKodiprops : undefined,
          };

          if (isValidStreamUrl(streamUrl) && isChannelPlayable(channelToAdd)) {
            result.push(channelToAdd);
          } else {
            console.log(`⚠️ [M3U] Skipping unplayable channel: ${currentMeta.name}`);
          }

          currentMeta = null;
          currentKodiprops = {};
          pendingLicenseType = null;
          pendingLicenseKey = null;
          pendingAudioTrack = null;
        }
      }
    }

    const uniqueResults = result.filter((channel, index, self) =>
      index === self.findIndex(c => c.url === channel.url)
    );

    uniqueResults.sort((a, b) => a.name.localeCompare(b.name));

    const uniqueGroups = Array.from(new Set(uniqueResults.map(ch => ch.group || "Lainnya"))).sort();

    return {
      channels: uniqueResults,
      groups: uniqueGroups,
      totalDuration: totalDuration > 0 ? totalDuration : undefined,
      hasCatchup: hasCatchup
    };
  }, [parseExtinfAttributes, cleanChannelName, parseUrlParameters, detectStreamType]);

  const loadCache = useCallback(async (): Promise<M3uParseResult | null> => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const cacheData: CacheData = JSON.parse(cached);
        if (cacheData.version === CACHE_VERSION &&
          Date.now() - cacheData.timestamp < CACHE_EXPIRY_MS) {
          return {
            channels: cacheData.channels,
            groups: cacheData.groups,
            hasCatchup: cacheData.channels.some(c => c.catchupSource || c.catchupId)
          };
        }
      }
      return null;
    } catch (e) {
      console.warn("Failed to load cache:", e);
      return null;
    }
  }, []);

  const saveCache = useCallback(async (parseResult: M3uParseResult) => {
    try {
      const cacheData: CacheData = {
        channels: parseResult.channels,
        groups: parseResult.groups,
        timestamp: Date.now(),
        version: CACHE_VERSION,
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
      console.warn("Failed to save cache:", e);
    }
  }, []);

  const loadUserUrls = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(USER_M3U_URLS_KEY);
      if (stored) {
        const urls = JSON.parse(stored);
        if (isMountedRef.current) {
          setUserUrls(Array.isArray(urls) ? urls : []);
        }
      }
    } catch (e) {
      console.warn("Failed to load user URLs:", e);
      if (isMountedRef.current) setUserUrls([]);
    }
  }, []);

  const fetchM3u = useCallback(async (overrideUrl?: string) => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel("New request started");
      cancelTokenRef.current = null;
    }

    if (fetchInProgressRef.current) return;

    setIsFetching(true);
    setLoading(true);
    fetchInProgressRef.current = true;

    cancelTokenRef.current = axios.CancelToken.source();

    try {
      let activeUrl = overrideUrl || (await AsyncStorage.getItem(ACTIVE_URL_KEY));

      if (!activeUrl) {
        const enabledDefault = DEFAULT_M3U_URLS.find(u => u.enabled);
        activeUrl = enabledDefault?.url || DEFAULT_M3U_URLS[0].url;
        await AsyncStorage.setItem(ACTIVE_URL_KEY, activeUrl);
      }

      if (!isValidUrl(activeUrl)) {
        throw new Error("URL M3U tidak valid");
      }

      console.log(`Fetching M3U from: ${activeUrl}`);

      const response = await axios.get(activeUrl, {
        timeout: 30000,
        headers: {
          'Accept': '*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cache-Control': 'no-cache',
        },
        cancelToken: cancelTokenRef.current.token,
      });

      if (!response.data || typeof response.data !== 'string') {
        throw new Error("Invalid M3U response format");
      }

      const parseResult = parseM3uBody(response.data);

      if (parseResult.channels.length > 0) {
        if (isMountedRef.current) {
          setChannels(parseResult.channels);
          setGroups(parseResult.groups);
          setError(null);

          const dashCount = parseResult.channels.filter(c => c.isDASH).length;
          const hlsCount = parseResult.channels.filter(c => c.isHLS).length;
          const encryptedCount = parseResult.channels.filter(c => c.isEncrypted).length;
          console.log(`Parsed ${parseResult.channels.length} channels (DASH: ${dashCount}, HLS: ${hlsCount}, Encrypted: ${encryptedCount})`);
        }
        await saveCache(parseResult);
      } else {
        throw new Error("M3U Kosong atau Format Salah");
      }

    } catch (err: any) {
      if (axios.isCancel(err)) {
        console.log("Request cancelled");
        return;
      }

      console.error("Fetch error:", err.message);

      const cached = await loadCache();
      if (cached && cached.channels.length > 0) {
        if (isMountedRef.current) {
          setChannels(cached.channels);
          setGroups(cached.groups);
          setError(`⚠️ Gagal memuat data terbaru: ${err.message}. Menampilkan data cache.`);
        }
      } else {
        if (isMountedRef.current) {
          setError(err.message || "Gagal memuat M3U. Periksa koneksi internet Anda.");
          setChannels([]);
          setGroups([]);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setIsFetching(false);
      }
      fetchInProgressRef.current = false;
      cancelTokenRef.current = null;
    }
  }, [parseM3uBody, isValidUrl, saveCache, loadCache]);

  const getLicenseConfig = useCallback((channel: Channel) => {
    if (!channel.licenseType || !channel.licenseKey) return null;
    return {
      licenseType: channel.licenseType,
      licenseKey: channel.licenseKey,
      headers: getChannelHeaders(channel)
    };
  }, []);

  const changeActiveUrl = useCallback(async (url: string) => {
    if (!isValidUrl(url)) {
      setError("URL tidak valid");
      return false;
    }

    if (isMountedRef.current) {
      setLoading(true);
      setChannels([]);
      setGroups([]);
      setError(null);
    }

    try {
      await AsyncStorage.setItem(ACTIVE_URL_KEY, url);
      await fetchM3u(url);
      return true;
    } catch (e) {
      console.error("Failed to change URL:", e);
      if (isMountedRef.current) setError("Gagal berpindah playlist");
      return false;
    }
  }, [fetchM3u, isValidUrl]);

  const addUrl = useCallback(async (newUrl: string) => {
    if (!isValidUrl(newUrl)) {
      setError("URL tidak valid");
      return false;
    }

    try {
      const stored = await AsyncStorage.getItem(USER_M3U_URLS_KEY);
      const list = stored ? JSON.parse(stored) : [];
      if (!list.includes(newUrl)) {
        const newList = [...list, newUrl];
        await AsyncStorage.setItem(USER_M3U_URLS_KEY, JSON.stringify(newList));
        if (isMountedRef.current) setUserUrls(newList);
        return true;
      }
      setError("URL sudah ada dalam daftar");
      return false;
    } catch (e) {
      console.error("Failed to add URL:", e);
      setError("Gagal menambah URL");
      return false;
    }
  }, [isValidUrl]);

  const deleteUrl = useCallback(async (urlToDelete: string) => {
    try {
      const newList = userUrls.filter(u => u !== urlToDelete);
      await AsyncStorage.setItem(USER_M3U_URLS_KEY, JSON.stringify(newList));
      if (isMountedRef.current) setUserUrls(newList);

      const activeUrl = await AsyncStorage.getItem(ACTIVE_URL_KEY);
      if (activeUrl === urlToDelete) {
        const defaultUrl = DEFAULT_M3U_URLS.find(u => u.enabled)?.url || DEFAULT_M3U_URLS[0].url;
        await changeActiveUrl(defaultUrl);
      }
      return true;
    } catch (e) {
      console.error("Failed to delete URL:", e);
      setError("Gagal menghapus URL");
      return false;
    }
  }, [userUrls, changeActiveUrl]);

  const refetch = useCallback(() => fetchM3u(), [fetchM3u]);

  const clearCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
      setError("✅ Cache berhasil dibersihkan");
      setTimeout(() => setError(null), 3000);
      return true;
    } catch (e) {
      console.error("Failed to clear cache:", e);
      return false;
    }
  }, []);

  const searchChannels = useCallback((query: string) => {
    if (!query || query.length < 2) return channels;
    const lowerQuery = query.toLowerCase();
    return channels.filter(c =>
      c.name.toLowerCase().includes(lowerQuery) ||
      (c.tvgName && c.tvgName.toLowerCase().includes(lowerQuery)) ||
      (c.group && c.group.toLowerCase().includes(lowerQuery))
    );
  }, [channels]);

  const getChannelsByGroup = useCallback((group: string) =>
    channels.filter(c => c.group === group),
    [channels]);

  const getChannelByUrl = useCallback((url: string) =>
    channels.find(c => c.url === url),
    [channels]);

  const getTotalChannels = useCallback(() => channels.length, [channels]);
  const getGroupsCount = useCallback(() => groups.length, [groups]);

  const getDASHChannels = useCallback(() => channels.filter(c => c.isDASH), [channels]);
  const getHLSChannels = useCallback(() => channels.filter(c => c.isHLS), [channels]);
  const getEncryptedChannels = useCallback(() => channels.filter(c => c.isEncrypted), [channels]);

  useEffect(() => {
    isMountedRef.current = true;
    const init = async () => {
      await loadUserUrls();
      await fetchM3u();
    };
    init();

    return () => {
      isMountedRef.current = false;
      if (cancelTokenRef.current) {
        cancelTokenRef.current.cancel("Component unmounted");
      }
    };
  }, []);

  return {
    channels,
    groups,
    loading,
    error,
    isFetching,
    refetch,
    addUrl,
    deleteUrl,
    userUrls,
    changeActiveUrl,
    defaultUrls: DEFAULT_M3U_URLS,
    clearCache,
    searchChannels,
    getChannelsByGroup,
    getChannelByUrl,
    getTotalChannels,
    getGroupsCount,
    isValidUrl,
    getLicenseConfig,
    getDASHChannels,
    getHLSChannels,
    getEncryptedChannels,
  };
};

export default useM3uParse;