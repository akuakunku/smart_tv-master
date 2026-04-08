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
  licenseType?: string | null;
  licenseKey?: string | null;
}

interface CacheData {
  channels: Channel[];
  groups: string[];
  timestamp: number;
}

const DEFAULT_M3U_URLS = [
  { name: "Era Digital TV", url: "https://raw.githubusercontent.com/eradigitaltv2025/ERADIGITALTV2026/refs/heads/main/SPORTTV", enabled: false },
  { name: "Backup List", url: "https://raw.githubusercontent.com/eradigitaltv2025/ERADIGITALTV/refs/heads/main/MONTOKTV", enabled: true },
];

const CACHE_KEY = "m3u_channels_cache";
const USER_M3U_URLS_KEY = "user_m3u_urls";
const ACTIVE_URL_KEY = "active_m3u_url";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 jam

const useM3uParse = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [userUrls, setUserUrls] = useState<string[]>([]);

  const fetchInProgressRef = useRef<boolean>(false);
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);

  // --- Validasi URL ---
  const isValidUrl = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);

  // --- Parser Robust ---
  const parseM3uBody = useCallback((data: string): Channel[] => {
    const lines = data.split(/\r?\n/);
    const result: Channel[] = [];
    let currentMeta: Partial<Channel> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("#EXTINF:")) {
        // Regex yang lebih kuat untuk menangkap atribut dengan/tanpa kutip
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

        // Menarik Nama Channel (setelah koma terakhir)
        const lastCommaIndex = line.lastIndexOf(",");
        info.name = lastCommaIndex !== -1 ? line.substring(lastCommaIndex + 1).trim() : "Unknown Channel";

        // Bersihkan nama dari karakter aneh
        if (info.name) {
          info.name = info.name.replace(/[^\x20-\x7E]/g, '').trim();
          if (!info.name) info.name = "Unknown Channel";
        }

        currentMeta = info;
      }
      else if (line.match(/^(https?:\/\/|rtsp:\/\/|rtmp:\/\/)/i)) {
        if (currentMeta) {
          let streamUrl = line;
          let userAgent = "VLC/3.0.11 LibVLC/3.0.11";
          let referrer = null;
          let licenseType = null;
          let licenseKey = null;

          // Parsing KODI/VLC style pipe parameters (|)
          if (streamUrl.includes("|")) {
            const parts = streamUrl.split("|");
            streamUrl = parts[0].trim();
            const paramsPart = parts[1];

            // Extract User-Agent
            const uaMatch = paramsPart.match(/User-Agent=([^&]*)/i);
            if (uaMatch) userAgent = decodeURIComponent(uaMatch[1]);

            // Extract Referer
            const refMatch = paramsPart.match(/Referer=([^&]*)/i);
            if (refMatch) referrer = decodeURIComponent(refMatch[1]);

            // Extract DRM (License)
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
            licenseType,
            licenseKey,
          });
          currentMeta = null;
        }
      }
    }

    // Filter duplicate URLs
    const uniqueResults = result.filter((channel, index, self) =>
      index === self.findIndex(c => c.url === channel.url)
    );

    return uniqueResults;
  }, []);

  // --- Load Cache dengan Expiry ---
  const loadCache = useCallback(async (): Promise<{ channels: Channel[]; groups: string[] } | null> => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const cacheData: CacheData = JSON.parse(cached);
        // Cek apakah cache masih valid (belum expired)
        if (Date.now() - cacheData.timestamp < CACHE_EXPIRY_MS) {
          return { channels: cacheData.channels, groups: cacheData.groups };
        }
      }
      return null;
    } catch (e) {
      console.error("Load cache error", e);
      return null;
    }
  }, []);

  // --- Save Cache ---
  const saveCache = useCallback(async (channelsData: Channel[], groupsData: string[]) => {
    try {
      const cacheData: CacheData = {
        channels: channelsData,
        groups: groupsData,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
      console.error("Save cache error", e);
    }
  }, []);

  // --- CRUD URL ---
  const loadUserUrls = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(USER_M3U_URLS_KEY);
      if (stored) {
        const urls = JSON.parse(stored);
        setUserUrls(Array.isArray(urls) ? urls : []);
      }
    } catch (e) {
      console.error("Load URLs error", e);
      setUserUrls([]);
    }
  }, []);

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
        setUserUrls(newList);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Add URL Error", e);
      setError("Gagal menambah URL");
      return false;
    }
  }, [isValidUrl]);

  const deleteUrl = useCallback(async (urlToDelete: string) => {
    try {
      const newList = userUrls.filter(u => u !== urlToDelete);
      await AsyncStorage.setItem(USER_M3U_URLS_KEY, JSON.stringify(newList));
      setUserUrls(newList);

      // Jika URL yang dihapus adalah active URL, pindah ke default
      const activeUrl = await AsyncStorage.getItem(ACTIVE_URL_KEY);
      if (activeUrl === urlToDelete) {
        const defaultUrl = DEFAULT_M3U_URLS.find(u => u.enabled)?.url || DEFAULT_M3U_URLS[0].url;
        await changeActiveUrl(defaultUrl);
      }
    } catch (e) {
      console.error("Delete URL Error", e);
      setError("Gagal menghapus URL");
    }
  }, [userUrls]);

  // --- Core Fetcher ---
  const fetchM3u = useCallback(async (overrideUrl?: string) => {
    // Cancel previous request if exists
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel("Request dibatalkan karena request baru");
    }

    if (fetchInProgressRef.current) return;

    setIsFetching(true);
    setLoading(true);
    fetchInProgressRef.current = true;

    // Create new cancel token
    cancelTokenRef.current = axios.CancelToken.source();

    try {
      let activeUrl = overrideUrl || (await AsyncStorage.getItem(ACTIVE_URL_KEY));

      if (!activeUrl) {
        activeUrl = DEFAULT_M3U_URLS.find(u => u.enabled)?.url || DEFAULT_M3U_URLS[0].url;
        await AsyncStorage.setItem(ACTIVE_URL_KEY, activeUrl);
      }

      // Validate URL
      if (!isValidUrl(activeUrl)) {
        throw new Error("URL M3U tidak valid");
      }

      // Fetch Data dengan Timeout & Header
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

        setChannels(parsedChannels);
        setGroups(uniqueGroups);
        setError(null);

        // Simpan Cache
        await saveCache(parsedChannels, uniqueGroups);
      } else {
        throw new Error("M3U Kosong atau Format Salah");
      }

    } catch (err: any) {
      if (axios.isCancel(err)) {
        console.log("Request cancelled:", err.message);
        return;
      }

      console.error("Fetch error:", err);

      // Try to load from cache
      const cached = await loadCache();
      if (cached && cached.channels.length > 0) {
        setChannels(cached.channels);
        setGroups(cached.groups);
        setError("Gagal memuat URL terbaru. Menampilkan data cache.");
      } else {
        setError(err.message || "Gagal memuat M3U. Periksa koneksi internet Anda.");
        setChannels([]);
        setGroups([]);
      }
    } finally {
      setLoading(false);
      setIsFetching(false);
      fetchInProgressRef.current = false;
      cancelTokenRef.current = null;
    }
  }, [parseM3uBody, isValidUrl, saveCache, loadCache]);

  const changeActiveUrl = useCallback(async (url: string) => {
    if (!isValidUrl(url)) {
      setError("URL tidak valid");
      return false;
    }

    setLoading(true);
    // Kosongkan channels agar UI utama tahu ada transisi playlist
    setChannels([]);
    setGroups([]);

    try {
      await AsyncStorage.setItem(ACTIVE_URL_KEY, url);
      // Panggil fetchM3u dengan parameter URL baru
      await fetchM3u(url);
      return true;
    } catch (e) {
      setError("Gagal berpindah playlist");
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchM3u, isValidUrl]);

  const refetch = useCallback(() => fetchM3u(), [fetchM3u]);

  // Clear cache
  const clearCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
      setError("Cache berhasil dibersihkan");
      return true;
    } catch (e) {
      console.error("Clear cache error", e);
      return false;
    }
  }, []);

  // Search channels with debounce support
  const searchChannels = useCallback((query: string) => {
    if (!query || query.length < 2) return channels;
    const lowerQuery = query.toLowerCase();
    return channels.filter(c =>
      c.name.toLowerCase().includes(lowerQuery) ||
      (c.group && c.group.toLowerCase().includes(lowerQuery))
    );
  }, [channels]);

  // Get channels by group
  const getChannelsByGroup = useCallback((group: string) => {
    return channels.filter(c => c.group === group);
  }, [channels]);

  // Initial Load
  useEffect(() => {
    loadUserUrls();
    fetchM3u();

    // Cleanup on unmount
    return () => {
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
    isValidUrl: isValidUrl,
  };
};

export default useM3uParse;