import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import { 
  View, 
  Text, 
  Image, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator,
  Dimensions,
  Animated,
  Platform
} from "react-native";
import { Ionicons } from '@expo/vector-icons';
import defaultLogo from "../assets/images/tv_banner.png";

export interface Channel {
  name: string;
  group: string;
  url: string;
  logo?: string;
  tvgId?: string;
}

export interface ChannelProps {
  channel: Channel;
  onPress: () => void;
  isActive?: boolean;
  showGroup?: boolean;
  showLiveIndicator?: boolean;
  imageSize?: 'small' | 'medium' | 'large';
}

const { width: screenWidth } = Dimensions.get('window');

// Responsive card widths based on screen size
const getCardWidth = () => {
  if (screenWidth >= 768) {
    return (screenWidth - 64) / 4; // Tablet: 4 columns
  }
  return (screenWidth - 48) / 3; // Phone: 3 columns
};

const CARD_WIDTH = getCardWidth();

const truncateName = (name: string, limit: number) => {
  if (!name) return "Unknown Channel";
  return name.length > limit ? `${name.substring(0, limit)}...` : name;
};

const LiveTVCard: React.FC<ChannelProps> = memo((({ 
  channel, 
  onPress, 
  isActive = false, 
  showGroup = false,
  showLiveIndicator = true,
  imageSize = 'medium'
}) => {
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [shouldShowDefault, setShouldShowDefault] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const hasValidLogo = channel?.logo && 
                      channel.logo.trim() !== '' && 
                      (channel.logo.startsWith('http://') || channel.logo.startsWith('https://'));

  // Image size styles
  const getImageContainerSize = () => {
    switch (imageSize) {
      case 'small': return { width: "70%", aspectRatio: 1 };
      case 'large': return { width: "90%", aspectRatio: 1 };
      default: return { width: "80%", aspectRatio: 1 };
    }
  };

  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startFadeIn = useCallback(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const animatePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    animatePress();
    onPress();
  }, [animatePress, onPress]);

  const handleImageLoad = useCallback(() => {
    if (!mountedRef.current) return;
    clearTimeouts();
    setImageStatus('loaded');
    setShouldShowDefault(false);
    setRetryCount(0);
    startFadeIn();
  }, [clearTimeouts, startFadeIn]);

  const handleImageError = useCallback(() => {
    if (!mountedRef.current) return;
    clearTimeouts();
    setImageStatus('error');
    
    // Only show default image after error
    setShouldShowDefault(true);
    startFadeIn();
  }, [clearTimeouts, startFadeIn]);

  const handleLoadStart = useCallback(() => {
    if (!mountedRef.current) return;
    clearTimeouts();
    setImageStatus('loading');
    setShouldShowDefault(false);
    fadeAnim.setValue(0);
    
    // Set timeout for slow loading (longer for retries)
    const timeoutDuration = retryCount > 0 ? 15000 : 10000;
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current && imageStatus === 'loading') {
        if (retryCount < 2) {
          // Retry loading
          setRetryCount(prev => prev + 1);
          setImageStatus('loading');
          handleLoadStart();
        } else {
          setImageStatus('error');
          setShouldShowDefault(true);
          startFadeIn();
        }
      }
    }, timeoutDuration);
  }, [clearTimeouts, fadeAnim, imageStatus, retryCount, startFadeIn]);

  const handleRetry = useCallback(() => {
    setImageStatus('loading');
    setShouldShowDefault(false);
    setRetryCount(0);
    handleLoadStart();
  }, [handleLoadStart]);

  // Reset state when channel changes
  useEffect(() => {
    mountedRef.current = true;
    setImageStatus('loading');
    setShouldShowDefault(!hasValidLogo);
    setRetryCount(0);
    fadeAnim.setValue(0);
    clearTimeouts();
    
    // If no valid logo, immediately show default
    if (!hasValidLogo) {
      setImageStatus('error');
      startFadeIn();
    }
    
    return () => {
      mountedRef.current = false;
      clearTimeouts();
    };
  }, [channel?.url, channel?.logo, hasValidLogo, clearTimeouts, fadeAnim, startFadeIn]);

  // Determine which image to show
  const showDefaultImage = shouldShowDefault || !hasValidLogo || imageStatus === 'error';
  const showChannelImage = hasValidLogo && !showDefaultImage && imageStatus !== 'error';
  const showLoading = imageStatus === 'loading' && showChannelImage && !showDefaultImage;

  const imageContainerSize = getImageContainerSize();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.cardContainer,
          isActive && styles.activeCard,
          { width: CARD_WIDTH }
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
        accessible={true}
        accessibilityLabel={`Watch ${channel.name} channel`}
        accessibilityHint="Double tap to play this channel"
        accessibilityRole="button"
      >
        <View style={[
          styles.imageContainer, 
          imageContainerSize,
          isActive && styles.activeImageContainer
        ]}>
          {/* Loading Indicator */}
          {showLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#edec25" />
              {retryCount > 0 && (
                <Text style={styles.retryCountText}>
                  Retry {retryCount}/2
                </Text>
              )}
            </View>
          )}
          
          {/* Channel Image */}
          {showChannelImage && (
            <Animated.View style={[styles.imageWrapper, { opacity: fadeAnim }]}>
              <Image
                source={{ uri: channel.logo }}
                style={styles.image}
                resizeMode="cover"
                onLoadStart={handleLoadStart}
                onLoad={handleImageLoad}
                onError={handleImageError}
                fadeDuration={0}
                progressiveRenderingEnabled={Platform.OS === 'android'}
              />
            </Animated.View>
          )}
          
          {/* Default Image - only shown when needed, no blinking */}
          {showDefaultImage && (
            <Animated.View style={[styles.imageWrapper, { opacity: fadeAnim }]}>
              <Image
                source={defaultLogo}
                style={[styles.image, styles.defaultImage]}
                resizeMode="contain"
                fadeDuration={0}
              />
            </Animated.View>
          )}
          
          {/* Play button overlay on active channel */}
          {isActive && (
            <View style={styles.playOverlay}>
              <Ionicons name="play-circle" size={30} color="#edec25" />
            </View>
          )}
          
          {/* Retry button when image fails and has valid logo */}
          {imageStatus === 'error' && hasValidLogo && !showDefaultImage && (
            <TouchableOpacity 
              style={styles.retryOverlay} 
              onPress={handleRetry}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={24} color="#edec25" />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.textContainer}>
          <Text style={[styles.text, isActive && styles.activeText]} numberOfLines={2}>
            {truncateName(channel.name, 25)}
          </Text>
          {showGroup && channel.group && channel.group !== "Unknown" && (
            <Text style={styles.groupText} numberOfLines={1}>
              {channel.group.length > 20 ? `${channel.group.substring(0, 20)}...` : channel.group}
            </Text>
          )}
        </View>
        
        {/* Live indicator */}
        {showLiveIndicator && isActive && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        
        {/* Quality indicator (optional - could be added based on video quality) */}
        {isActive && (
          <View style={styles.qualityBadge}>
            <Ionicons name="tv-outline" size={10} color="#edec25" />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}));

LiveTVCard.displayName = 'LiveTVCard';

const styles = StyleSheet.create({
  cardContainer: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    padding: 10,
    margin: 6,
    borderWidth: 2,
    borderColor: "#444",
    alignSelf: "flex-start",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  activeCard: {
    borderColor: "#edec25",
    backgroundColor: "#333",
    shadowColor: "#edec25",
    shadowOpacity: 0.3,
    elevation: 8,
    transform: [{ scale: 1.02 }],
  },
  imageContainer: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    marginBottom: 6,
    overflow: "hidden",
    backgroundColor: "#1e1e1e",
    position: "relative",
  },
  activeImageContainer: {
    borderWidth: 2,
    borderColor: "#edec25",
  },
  imageWrapper: {
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  defaultImage: {
    resizeMode: "contain",
    padding: 10,
  },
  textContainer: {
    alignItems: "center",
    width: "100%",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: 5,
  },
  activeText: {
    color: "#edec25",
    fontWeight: "bold",
  },
  groupText: {
    fontSize: 10,
    color: "#888",
    textAlign: "center",
    marginTop: 2,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    zIndex: 2,
    borderRadius: 10,
    gap: 8,
  },
  retryCountText: {
    color: '#edec25',
    fontSize: 10,
    fontWeight: 'bold',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    zIndex: 3,
  },
  retryOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    zIndex: 4,
    gap: 8,
  },
  retryText: {
    color: '#edec25',
    fontSize: 12,
    fontWeight: 'bold',
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
    zIndex: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  qualityBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 5,
  },
});

export default LiveTVCard;