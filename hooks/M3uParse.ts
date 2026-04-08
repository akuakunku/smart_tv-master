import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios, { CancelTokenSource } from "axios";

// --- Interfaces ---
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

  return headers;
};

interface CacheData {
  channels: Channel[];
  groups: string[];
  timestamp: number;
}

const DEFAULT_M3U_URLS = [
  { name: "Default", url: "https://pastebin.com/raw/4zUPUCVr", enabled: false },
  { name: "Backup 1", url: "https://raw.githubusercontent.com/eradigitaltv2025/ERADIGITALTV/refs/heads/main/MONTOKTV", enabled: true },
];

const CACHE_KEY = "m3u_channels_cache";
const USER_M3U_URLS_KEY = "user_m3u_urls";
const ACTIVE_URL_KEY = "active_m3u_url";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

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
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);

  const parseM3uBody = useCallback((data: string): Channel[] => {
    const lines = data.split(/\r?\n/);
    const result: Channel[] = [];
    let currentMeta: Partial<Channel> | null = null;
    let pendingLicenseType: string | null = null;
    let pendingLicenseKey: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("#KODIPROP:")) {
        const kodipropMatch = line.match(/#KODIPROP:(.+?)=(.+)/);
        if (kodipropMatch) {
          const key = kodipropMatch[1].trim();
          const value = kodipropMatch[2].trim();

          if (key === 'inputstream.adaptive.license_type') {
            pendingLicenseType = value;
          } else if (key === 'inputstream.adaptive.license_key') {
            pendingLicenseKey = value;
          }
        }
        continue;
      }

      if (line.startsWith("#EXTINF:")) {
        const tvgIdMatch = line.match(/tvg-id=["']?([^"'\s,]+)["']?/i);
        const tvgNameMatch = line.match(/tvg-name=["']?([^"']*)["']?/i);
        const logoMatch = line.match(/tvg-logo=["']?([^"']*)["']?/i);
        const groupMatch = line.match(/group-title=["']?([^"']*)["']?/i);

        const info: Partial<Channel> = {
          tvgId: tvgIdMatch?.[1] || null,
          tvgName: tvgNameMatch?.[1] || null,
          logo: logoMatch?.[1] || null,
          group: groupMatch?.[1] || "Lainnya",
        };

        const lastCommaIndex = line.lastIndexOf(",");
        info.name = lastCommaIndex !== -1 ? line.substring(lastCommaIndex + 1).trim() : "Unknown Channel";

        if (info.name) {
          info.name = info.name.replace(/[^\x20-\x7E]/g, '').trim();
          if (!info.name) info.name = "Unknown Channel";
        }

        currentMeta = info;
        continue;
      }
      
      if (line.match(/^(https?:\/\/|rtsp:\/\/|rtmp:\/\/)/i)) {
        if (currentMeta) {
          let streamUrl = line;
          let userAgent = "VLC/3.0.11 LibVLC/3.0.11";
          let referrer = null;
          let origin = null;
          let licenseType = pendingLicenseType;
          let licenseKey = pendingLicenseKey;

          if (streamUrl.includes("|")) {
            const parts = streamUrl.split("|");
            streamUrl = parts[0].trim();
            const paramsPart = parts[1];

            const uaMatch = paramsPart.match(/User-Agent=([^&]*)/i);
            if (uaMatch) userAgent = decodeURIComponent(uaMatch[1]);

            const refMatch = paramsPart.match(/Referer=([^&]*)/i);
            if (refMatch) referrer = decodeURIComponent(refMatch[1]);

            const originMatch = paramsPart.match(/Origin=([^&]*)/i);
            if (originMatch) origin = decodeURIComponent(originMatch[1]);

            const licTypeMatch = paramsPart.match(/license_type=([^&]*)/i);
            if (licTypeMatch) licenseType = licTypeMatch[1];

            const licKeyMatch = paramsPart.match(/license_key=([^&]*)/i);
            if (licKeyMatch) licenseKey = decodeURIComponent(licKeyMatch[1]);
          }

          result.push({
            ...(currentMeta as Channel),
            url: streamUrl,
            userAgent,
            referrer,
            origin,
            licenseType: licenseType || null,
            licenseKey: licenseKey || null,
          });
          
          currentMeta = null;
          pendingLicenseType = null;
          pendingLicenseKey = null;
        }
      }
    }

    const uniqueResults = result.filter((channel, index, self) =>
      index === self.findIndex(c => c.url === channel.url)
    );

    return uniqueResults;
  }, []);

  const loadCache = useCallback(async (): Promise<{ channels: Channel[]; groups: string[] } | null> => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const cacheData: CacheData = JSON.parse(cached);
        if (Date.now() - cacheData.timestamp < CACHE_EXPIRY_MS) {
          return { channels: cacheData.channels, groups: cacheData.groups };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }, []);

  const saveCache = useCallback(async (channelsData: Channel[], groupsData: string[]) => {
    try {
      const cacheData: CacheData = {
        channels: channelsData,
        groups: groupsData,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {}
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

      const response = await axios.get(activeUrl, {
        timeout: 20000,
        headers: {
          'Accept': '*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        cancelToken: cancelTokenRef.current.token,
      });

      const parsedChannels = parseM3uBody(response.data);

      if (parsedChannels.length > 0) {
        const uniqueGroups = Array.from(new Set(parsedChannels.map(ch => ch.group || "Lainnya"))).sort();

        if (isMountedRef.current) {
          setChannels(parsedChannels);
          setGroups(uniqueGroups);
          setError(null);
        }

        await saveCache(parsedChannels, uniqueGroups);
      } else {
        throw new Error("M3U Kosong atau Format Salah");
      }

    } catch (err: any) {
      if (axios.isCancel(err)) return;

      const cached = await loadCache();
      if (cached && cached.channels.length > 0) {
        if (isMountedRef.current) {
          setChannels(cached.channels);
          setGroups(cached.groups);
          setError("Gagal memuat URL terbaru. Menampilkan data cache.");
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
      return false;
    } catch (e) {
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
    } catch (e) {
      setError("Gagal menghapus URL");
    }
  }, [userUrls, changeActiveUrl]);

  const refetch = useCallback(() => fetchM3u(), [fetchM3u]);
  const clearCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
      setError("Cache berhasil dibersihkan");
      return true;
    } catch (e) { return false; }
  }, []);

  const searchChannels = useCallback((query: string) => {
    if (!query || query.length < 2) return channels;
    const lowerQuery = query.toLowerCase();
    return channels.filter(c =>
      c.name.toLowerCase().includes(lowerQuery) ||
      (c.group && c.group.toLowerCase().includes(lowerQuery))
    );
  }, [channels]);

  const getChannelsByGroup = useCallback((group: string) => channels.filter(c => c.group === group), [channels]);
  const getChannelByUrl = useCallback((url: string) => channels.find(c => c.url === url), [channels]);
  const getTotalChannels = useCallback(() => channels.length, [channels]);
  const getGroupsCount = useCallback(() => groups.length, [groups]);

  useEffect(() => {
    isMountedRef.current = true;
    const init = async () => {
      await loadUserUrls();
      await fetchM3u();
    };
    init();
    return () => {
      isMountedRef.current = false;
      if (cancelTokenRef.current) cancelTokenRef.current.cancel("Component unmounted");
    };
  }, []);

  return {
    channels, groups, loading, error, isFetching, refetch, addUrl, deleteUrl,
    userUrls, changeActiveUrl, defaultUrls: DEFAULT_M3U_URLS, clearCache,
    searchChannels, getChannelsByGroup, getChannelByUrl, getTotalChannels,
    getGroupsCount, isValidUrl,
  };
};

export default useM3uParse;