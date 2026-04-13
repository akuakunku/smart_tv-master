export const SUPPORTED_CONTAINERS = [
  'mp4', 'm4v', 'mov', 'ts', 'mkv', 'webm', 'flv', 'avi', '3gp', '3gpp'
];

export const SUPPORTED_STREAMING_FORMATS = [
  'm3u8', 'm3u', 'mpd', 'ism', 'isml', 'dash'
];

export const SUPPORTED_AUDIO_FORMATS = [
  'mp3', 'aac', 'ogg', 'wav', 'flac', 'm4a', 'opus'
];

export const SUBTITLE_FORMATS = [
  'vtt', 'srt', 'ttml', 'dfxp'
];

export interface VideoFormatInfo {
  extension: string;
  isStreaming: boolean;
  isDASH: boolean;
  isHLS: boolean;
  isContainer: boolean;
  isAudio: boolean;
  needsLicense: boolean;
  protocol: 'hls' | 'dash' | 'progressive' | 'unknown';
}

export const getUrlExtension = (url: string): string => {
  try {
    let cleanUrl = url.split('|')[0];
    cleanUrl = cleanUrl.split('?')[0];
    cleanUrl = cleanUrl.split('#')[0];
    cleanUrl = cleanUrl.replace(/\/+$/, '');
    cleanUrl = cleanUrl.replace(/\/+/g, '/');

    const lastSegment = cleanUrl.split('/').pop() || '';
    const extension = lastSegment.split('.').pop()?.toLowerCase() || '';

    if (cleanUrl.includes('manifest.mpd')) return 'mpd';
    if (cleanUrl.includes('manifest.m3u8')) return 'm3u8';
    if (cleanUrl.includes('master.m3u8')) return 'm3u8';
    if (cleanUrl.includes('index.m3u8')) return 'm3u8';

    return extension;
  } catch (error) {
    console.warn('Error getting URL extension:', error);
    return '';
  }
};

export const isStreamingFormat = (url: string): boolean => {
  const ext = getUrlExtension(url);
  const isKnownStreaming = SUPPORTED_STREAMING_FORMATS.includes(ext);

  const urlLower = url.toLowerCase();
  const hasPattern =
    urlLower.includes('.m3u8') ||
    urlLower.includes('.mpd') ||
    urlLower.includes('manifest') ||
    urlLower.includes('master.m3u8') ||
    urlLower.includes('index.m3u8') ||
    urlLower.includes('/dash/') ||
    urlLower.includes('/hls/');

  return isKnownStreaming || hasPattern;
};

export const isDASHStream = (url: string): boolean => {
  const ext = getUrlExtension(url);
  const urlLower = url.toLowerCase();

  return ext === 'mpd' ||
    urlLower.includes('.mpd') ||
    urlLower.includes('manifest.mpd') ||
    urlLower.includes('/dash/') ||
    urlLower.includes('dash-manifest');
};

export const isHLSStream = (url: string): boolean => {
  const ext = getUrlExtension(url);
  const urlLower = url.toLowerCase();

  return ext === 'm3u8' ||
    urlLower.includes('.m3u8') ||
    urlLower.includes('master.m3u8') ||
    urlLower.includes('index.m3u8') ||
    urlLower.includes('/hls/') ||
    urlLower.includes('hls-manifest');
};

export const isValidVideoUrl = (url: string): boolean => {
  try {
    const cleanUrl = url.split('|')[0];
    if (!cleanUrl || cleanUrl.length < 10) return false;
    const urlPattern = /^(https?:\/\/|rtsp:\/\/|rtmp:\/\/)/i;
    if (!urlPattern.test(cleanUrl)) return false;
    const urlObj = new URL(cleanUrl);
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:' &&
        urlObj.protocol !== 'rtsp:' && urlObj.protocol !== 'rtmp:') {
      return false;
    }
    if (!urlObj.hostname || urlObj.hostname.length < 3) return false;
    if (cleanUrl.includes('///')) return false;
    
    const formatInfo = getVideoFormatInfo(cleanUrl);
    return formatInfo.isStreaming || formatInfo.isContainer;
  } catch {
    return false;
  }
};

export const getVideoFormatInfo = (url: string): VideoFormatInfo => {
  const extension = getUrlExtension(url);
  const isDASH = isDASHStream(url);
  const isHLS = isHLSStream(url);
  const isStreaming = isDASH || isHLS || isStreamingFormat(url);
  const isContainer = SUPPORTED_CONTAINERS.includes(extension);
  const isAudio = SUPPORTED_AUDIO_FORMATS.includes(extension);

  let protocol: VideoFormatInfo['protocol'] = 'unknown';
  if (isDASH) protocol = 'dash';
  else if (isHLS) protocol = 'hls';
  else if (isContainer) protocol = 'progressive';

  const needsLicense = isDASH && (
    url.includes('license') ||
    url.includes('widevine') ||
    url.includes('clearkey')
  );

  return {
    extension,
    isStreaming,
    isDASH,
    isHLS,
    isContainer,
    isAudio,
    needsLicense,
    protocol
  };
};

export const getAlternativeUrl = (url: string): string[] => {
  const cleanUrl = url.split('|')[0].split('?')[0];
  const alternatives: string[] = [url];
  const formatInfo = getVideoFormatInfo(cleanUrl);

  if (formatInfo.isHLS) {
    if (cleanUrl.endsWith('.m3u8')) {
      alternatives.push(cleanUrl.replace('.m3u8', '.ts'));
      if (cleanUrl.includes('master.m3u8')) {
        alternatives.push(cleanUrl.replace('master.m3u8', 'index.m3u8'));
        alternatives.push(cleanUrl.replace('master.m3u8', 'media.m3u8'));
      }
    }
    alternatives.push(cleanUrl.replace('.m3u8', '.mpd'));
  }

  if (formatInfo.isDASH) {
    alternatives.push(cleanUrl.replace('.mpd', '.m3u8'));
    alternatives.push(cleanUrl.replace('manifest.mpd', 'master.m3u8'));
    if (cleanUrl.includes('manifest.mpd')) {
      const baseUrl = cleanUrl.replace('manifest.mpd', '');
      alternatives.push(baseUrl + 'index.m3u8');
      alternatives.push(baseUrl + 'playlist.m3u8');
    }
  }

  if (formatInfo.isContainer) {
    const baseWithoutExt = cleanUrl.substring(0, cleanUrl.lastIndexOf('.'));
    for (const container of SUPPORTED_CONTAINERS) {
      if (container !== formatInfo.extension) {
        alternatives.push(`${baseWithoutExt}.${container}`);
      }
    }
  }

  return [...new Set(alternatives)].filter(alt => {
    try {
      new URL(alt.split('|')[0]);
      return true;
    } catch {
      return false;
    }
  });
};

export const getMimeType = (url: string): string => {
  const formatInfo = getVideoFormatInfo(url);

  if (formatInfo.isDASH) {
    return 'application/dash+xml';
  }
  if (formatInfo.isHLS) {
    return 'application/vnd.apple.mpegurl';
  }

  const mimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'm4v': 'video/x-m4v',
    'mov': 'video/quicktime',
    'ts': 'video/MP2T',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'flv': 'video/x-flv',
    'avi': 'video/x-msvideo',
    'mp3': 'audio/mpeg',
    'aac': 'audio/aac',
    'ogg': 'audio/ogg'
  };

  return mimeTypes[formatInfo.extension] || 'video/mp4';
};

export const extractUrlHeaders = (url: string): Record<string, string> => {
  const headers: Record<string, string> = {};

  if (url.includes('|')) {
    const parts = url.split('|');
    const paramsString = parts[1];
    const params = new URLSearchParams(paramsString);

    for (const [key, value] of params.entries()) {
      if (!key.toLowerCase().includes('license')) {
        headers[key] = decodeURIComponent(value);
      }
    }
  }

  return headers;
};

export const extractLicenseInfo = (url: string): { type?: string; key?: string } => {
  const info: { type?: string; key?: string } = {};

  if (url.includes('|')) {
    const paramsString = url.split('|')[1];
    const params = new URLSearchParams(paramsString);

    const licenseType = params.get('license_type');
    if (licenseType) info.type = licenseType;

    const licenseKey = params.get('license_key');
    if (licenseKey) info.key = decodeURIComponent(licenseKey);
  }

  return info;
};

export default {
  SUPPORTED_CONTAINERS,
  SUPPORTED_STREAMING_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
  SUBTITLE_FORMATS,
  getUrlExtension,
  isStreamingFormat,
  isDASHStream,
  isHLSStream,
  getVideoFormatInfo,
  getAlternativeUrl,
  isValidVideoUrl,
  getMimeType,
  extractUrlHeaders,
  extractLicenseInfo
};