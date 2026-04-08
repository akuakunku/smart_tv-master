export const SUPPORTED_CONTAINERS = [
  'mp4', 'm4v', 'mov', 'ts', 'mkv', 'webm', 'flv', 'avi'
];

export const SUPPORTED_STREAMING_FORMATS = [
  'm3u8', 'm3u', 'mpd', 'ism'
];

/**
 * Mendapatkan ekstensi dari URL mentah (menghapus parameter pipe)
 */
export const getUrlExtension = (url: string): string => {
  const cleanUrl = url.split('|')[0].split('?')[0];
  return cleanUrl.split('.').pop()?.toLowerCase() || '';
};

/**
 * Cek apakah URL adalah format streaming (HLS/DASH)
 */
export const isStreamingFormat = (url: string): boolean => {
  const ext = getUrlExtension(url);
  return SUPPORTED_STREAMING_FORMATS.includes(ext);
};

/**
 * Mencoba URL alternatif jika satu format gagal
 */
export const getAlternativeUrl = (url: string): string[] => {
  const cleanUrl = url.split('|')[0];
  const alternatives: string[] = [url];
  
  if (cleanUrl.endsWith('.ts')) {
    alternatives.push(cleanUrl.replace('.ts', '.m3u8'));
  } else if (cleanUrl.endsWith('.m3u8')) {
    alternatives.push(cleanUrl.replace('.m3u8', '.ts'));
  }
  
  return [...new Set(alternatives)];
};