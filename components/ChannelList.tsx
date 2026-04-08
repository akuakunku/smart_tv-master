// components/ChannelList.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from 'expo-blur';

interface Channel {
  name: string;
  url: string;
  logo: string | null;
  group?: string;
  tvgId?: string | null;
}

interface ChannelListProps {
  channels: Channel[];
  currentChannelUrl: string;
  onChannelSelect?: (channelUrl: string) => void;
  maxRecommendations?: number;
  showSectionTitle?: boolean;
}

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffledArray = [...array];
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }
  return shuffledArray;
};

// OPTIMASI: ChannelLogo dengan memo dan proper caching
const ChannelLogo = React.memo(({ logo, channelName, size = 80 }: { logo: string | null, channelName: string, size?: number }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const defaultImage = require("../assets/images/maskable.png");

  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
  }, [logo]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const source = useMemo(() => {
    if (hasError || !logo) return defaultImage;
    if (logo.startsWith('http://') || logo.startsWith('https://')) {
      return { uri: logo };
    }
    return defaultImage;
  }, [logo, hasError]);

  return (
    <View style={[styles.logoWrapper, { width: size, height: size, borderRadius: size / 2 }]}>
      {isLoading && (
        <View style={[styles.logoLoading, { borderRadius: size / 2 }]}>
          <ActivityIndicator size="small" color="#edec25" />
        </View>
      )}
      <Image
        source={source}
        style={[styles.channelLogo, { width: size, height: size, borderRadius: size / 2 }]}
        defaultSource={defaultImage}
        onLoad={handleLoad}
        onError={handleError}
        fadeDuration={Platform.OS === 'android' ? 0 : 200}
      />
    </View>
  );
});

// OPTIMASI: ChannelItem dengan memo
const ChannelItem = React.memo(({ 
  item, 
  cardWidth, 
  currentChannelUrl,
  onPress,
}: { 
  item: Channel;
  cardWidth: number;
  currentChannelUrl: string;
  onPress: (url: string) => void;
}) => {
  const isActive = item.url === currentChannelUrl;
  
  return (
    <TouchableOpacity
      style={[
        styles.channelCard, 
        { width: cardWidth },
        isActive && styles.activeCard
      ]}
      onPress={() => onPress(item.url)}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={isActive ? 
          ['rgba(237, 236, 37, 0.2)', 'rgba(237, 236, 37, 0.05)'] : 
          ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
        style={styles.cardGradient}
      >
        <BlurView intensity={isActive ? 30 : 20} style={styles.blurContainer}>
          <View style={styles.imageContainer}>
            <ChannelLogo logo={item.logo} channelName={item.name} size={70} />
            {isActive && (
              <View style={styles.activeOverlay}>
                <View style={styles.playingDot} />
              </View>
            )}
          </View>
          <Text style={[styles.channelName, isActive && styles.activeText]} numberOfLines={2}>
            {item.name || "Unknown Channel"}
          </Text>
          <Text style={styles.groupName} numberOfLines={1}>
            {item.group && item.group !== "Lainnya" && item.group !== "Unknown" ? item.group : 'TV Channel'}
          </Text>
          {isActive && (
            <View style={styles.nowPlayingBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.nowPlayingText}>LIVE</Text>
            </View>
          )}
        </BlurView>
      </LinearGradient>
    </TouchableOpacity>
  );
});

// OPTIMASI: ChannelList dengan windowSize dan maxToRenderPerBatch yang lebih kecil
const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  currentChannelUrl,
  onChannelSelect,
  maxRecommendations = 8, // Kurangi dari 12 menjadi 8
  showSectionTitle = true
}) => {
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const [recommendedChannels, setRecommendedChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const previousGroupRef = useRef<string>('');
  const isMountedRef = useRef(true);

  // Calculate responsive card width - lebih kecil untuk menampung lebih banyak
  const cardWidth = useMemo(() => {
    if (width <= 360) return 100;
    if (width <= 480) return 120;
    if (width <= 768) return 140;
    return 160;
  }, [width]);

  // Get current channel group
  const currentChannelGroup = useMemo(() => {
    const currentChannel = channels.find(channel => channel.url === currentChannelUrl);
    return currentChannel?.group || null;
  }, [channels, currentChannelUrl]);

  // Generate recommendations
  const generateRecommendations = useCallback(() => {
    if (!isMountedRef.current) return;
    
    setIsLoading(true);
    
    if (currentChannelGroup) {
      const filteredChannels = channels.filter(
        channel => channel.group === currentChannelGroup && channel.url !== currentChannelUrl
      );
      
      let shuffledChannels;
      if (previousGroupRef.current === currentChannelGroup) {
        shuffledChannels = filteredChannels.slice(0, maxRecommendations);
      } else {
        shuffledChannels = shuffleArray(filteredChannels).slice(0, maxRecommendations);
        previousGroupRef.current = currentChannelGroup;
      }
      
      setRecommendedChannels(shuffledChannels);
    } else {
      const otherChannels = channels.filter(channel => channel.url !== currentChannelUrl);
      const shuffledChannels = shuffleArray(otherChannels).slice(0, maxRecommendations);
      setRecommendedChannels(shuffledChannels);
    }
    setIsLoading(false);
  }, [channels, currentChannelUrl, currentChannelGroup, maxRecommendations]);

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      generateRecommendations();
    }, 50); // Kurangi delay

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
    };
  }, [generateRecommendations]);

  const handleChannelChange = useCallback((channelUrl: string) => {
    const selectedChannel = channels.find(c => c.url === channelUrl);
    if (!selectedChannel) return;

    if (onChannelSelect) {
      onChannelSelect(channelUrl);
    } else {
      navigation.navigate("PlayerScreen", { url: channelUrl });
    }
  }, [channels, onChannelSelect, navigation]);

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    
    if (currentChannelGroup) {
      const filteredChannels = channels.filter(
        channel => channel.group === currentChannelGroup && channel.url !== currentChannelUrl
      );
      const shuffledChannels = shuffleArray(filteredChannels).slice(0, maxRecommendations);
      setRecommendedChannels(shuffledChannels);
    } else {
      const otherChannels = channels.filter(channel => channel.url !== currentChannelUrl);
      const shuffledChannels = shuffleArray(otherChannels).slice(0, maxRecommendations);
      setRecommendedChannels(shuffledChannels);
    }
    
    setTimeout(() => {
      setIsRefreshing(false);
    }, 300);
  }, [channels, currentChannelGroup, currentChannelUrl, maxRecommendations, isRefreshing]);

  const renderItem = useCallback(({ item }: { item: Channel }) => (
    <ChannelItem
      item={item}
      cardWidth={cardWidth}
      currentChannelUrl={currentChannelUrl}
      onPress={handleChannelChange}
    />
  ), [cardWidth, currentChannelUrl, handleChannelChange]);

  const keyExtractor = useCallback((item: Channel, index: number) => `${item.url}-${index}`, []);

  const getSectionTitle = useMemo(() => {
    if (currentChannelGroup && currentChannelGroup !== "Lainnya" && currentChannelGroup !== "Unknown") {
      return `More from ${currentChannelGroup}`;
    }
    return "Recommended for You";
  }, [currentChannelGroup]);

  const getChannelCount = useMemo(() => {
    if (currentChannelGroup && currentChannelGroup !== "Lainnya" && currentChannelGroup !== "Unknown") {
      const totalInGroup = channels.filter(ch => ch.group === currentChannelGroup).length;
      return `${recommendedChannels.length} of ${totalInGroup - 1} channels`;
    }
    return `${recommendedChannels.length} recommendations`;
  }, [channels, currentChannelGroup, recommendedChannels.length]);

  if (isLoading && recommendedChannels.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#edec25" />
        <Text style={styles.loadingText}>Loading recommendations...</Text>
      </View>
    );
  }

  if (recommendedChannels.length === 0 && !isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No other channels available</Text>
      </View>
    );
  }

  return (
    <View style={styles.recommendationContainer}>
      {showSectionTitle && (
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.recommendationTitle}>{getSectionTitle}</Text>
            <Text style={styles.channelCount}>{getChannelCount}</Text>
          </View>
          <TouchableOpacity 
            style={[styles.refreshButton, isRefreshing && styles.refreshButtonDisabled]}
            onPress={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#edec25" />
            ) : (
              <Text style={styles.refreshText}>Refresh</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        horizontal
        data={recommendedChannels}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        snapToAlignment="start"
        decelerationRate="fast"
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        getItemLayout={(data, index) => ({
          length: cardWidth + 16,
          offset: (cardWidth + 16) * index,
          index,
        })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  recommendationContainer: { 
    marginTop: 16, 
    marginBottom: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
    marginHorizontal: 12,
  },
  recommendationTitle: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    color: '#fff',
  },
  channelCount: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  refreshButton: {
    backgroundColor: 'rgba(237, 236, 37, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(237, 236, 37, 0.3)',
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  refreshText: {
    color: '#edec25',
    fontSize: 11,
    fontWeight: '600',
  },
  channelCard: { 
    marginHorizontal: 6, 
    borderRadius: 14, 
    overflow: 'hidden',
    ...Platform.select({ 
      ios: { 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.25, 
        shadowRadius: 4 
      }, 
      android: { 
        elevation: 4 
      } 
    }),
  },
  activeCard: {
    transform: [{ scale: 1.02 }],
    elevation: 6,
  },
  cardGradient: { 
    height: 190, 
    padding: 2, 
    borderRadius: 14,
  },
  blurContainer: { 
    flex: 1, 
    borderRadius: 12, 
    overflow: 'hidden', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  imageContainer: { 
    position: 'relative', 
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  logoWrapper: {
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    zIndex: 1,
  },
  channelLogo: { 
    backgroundColor: '#2a2a2a',
    resizeMode: 'contain',
  },
  activeOverlay: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    borderRadius: 35, 
    backgroundColor: 'rgba(237, 236, 37, 0.15)', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#edec25',
  },
  playingDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    backgroundColor: '#edec25',
    shadowColor: '#edec25',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  channelName: { 
    color: '#fff', 
    fontSize: 12, 
    fontWeight: '600', 
    textAlign: 'center', 
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  activeText: {
    color: '#edec25',
  },
  groupName: { 
    color: 'rgba(255,255,255,0.6)', 
    fontSize: 10, 
    textAlign: 'center',
  },
  nowPlayingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(237, 236, 37, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ff4444',
  },
  nowPlayingText: {
    color: '#1e1e1e',
    fontSize: 7,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 11,
    marginTop: 6,
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  contentContainer: { 
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});

export default ChannelList;