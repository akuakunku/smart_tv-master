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
import { useNavigation, useFocusEffect } from "@react-navigation/native";
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

const ChannelLogo = React.memo(({ logo, channelName, size = 80 }: { logo: string | null, channelName: string, size?: number }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const defaultImage = require("../assets/images/maskable.png");

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const source = useMemo(() => {
    if (hasError || !logo) return defaultImage;
    return { uri: logo };
  }, [logo, hasError]);

  return (
    <View style={[styles.logoWrapper, { width: size, height: size, borderRadius: size / 2 }]}>
      {isLoading && (
        <View style={styles.logoLoading}>
          <ActivityIndicator size="small" color="#edec25" />
        </View>
      )}
      <Image
        source={source}
        style={[styles.channelLogo, { width: size, height: size, borderRadius: size / 2 }]}
        defaultSource={defaultImage}
        onLoad={handleLoad}
        onError={handleError}
        accessibilityLabel={`${channelName} logo`}
        fadeDuration={Platform.OS === 'android' ? 0 : 200}
      />
    </View>
  );
});

const ChannelItem = React.memo(({ 
  item, 
  cardWidth, 
  currentChannelUrl,
  onPress,
  index
}: { 
  item: Channel;
  cardWidth: number;
  currentChannelUrl: string;
  onPress: (url: string) => void;
  index: number;
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
            {item.name}
          </Text>
          <Text style={styles.groupName} numberOfLines={1}>
            {item.group || 'TV Channel'}
          </Text>
          {isActive && (
            <View style={styles.nowPlayingBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.nowPlayingText}>NOW PLAYING</Text>
            </View>
          )}
        </BlurView>
      </LinearGradient>
    </TouchableOpacity>
  );
});

const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  currentChannelUrl,
  onChannelSelect,
  maxRecommendations = 12,
  showSectionTitle = true
}) => {
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const [recommendedChannels, setRecommendedChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const previousGroupRef = useRef<string>('');

  // Calculate responsive card width
  const cardWidth = useMemo(() => {
    if (width <= 360) return 120;
    if (width <= 480) return 140;
    if (width <= 768) return 160;
    return 180;
  }, [width]);

  // Get current channel group
  const currentChannelGroup = useMemo(() => {
    const currentChannel = channels.find(channel => channel.url === currentChannelUrl);
    return currentChannel?.group || null;
  }, [channels, currentChannelUrl]);

  // Generate recommendations based on current channel group
  useEffect(() => {
    setIsLoading(true);
    
    // Small delay to prevent flickering
    const timer = setTimeout(() => {
      if (currentChannelGroup) {
        const filteredChannels = channels.filter(
          channel => channel.group === currentChannelGroup && channel.url !== currentChannelUrl
        );
        
        // Don't shuffle if group hasn't changed to maintain consistency
        let shuffledChannels;
        if (previousGroupRef.current === currentChannelGroup) {
          // Keep existing order if same group
          shuffledChannels = filteredChannels.slice(0, maxRecommendations);
        } else {
          shuffledChannels = shuffleArray(filteredChannels).slice(0, maxRecommendations);
          previousGroupRef.current = currentChannelGroup;
        }
        
        setRecommendedChannels(shuffledChannels);
      } else {
        // If no group, show random channels from different groups
        const otherChannels = channels.filter(channel => channel.url !== currentChannelUrl);
        const shuffledChannels = shuffleArray(otherChannels).slice(0, maxRecommendations);
        setRecommendedChannels(shuffledChannels);
      }
      setIsLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [currentChannelUrl, channels, currentChannelGroup, maxRecommendations]);

  // Scroll to top when recommendations change
  useEffect(() => {
    if (flatListRef.current && recommendedChannels.length > 0) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [currentChannelUrl]);

  const handleChannelChange = useCallback((channelUrl: string) => {
    const selectedChannel = channels.find(c => c.url === channelUrl);
    if (!selectedChannel) return;

    if (onChannelSelect) {
      onChannelSelect(channelUrl);
    } else {
      navigation.navigate("PlayerScreen", { url: channelUrl });
    }
  }, [channels, onChannelSelect, navigation]);

  const renderItem = useCallback(({ item, index }: { item: Channel; index: number }) => (
    <ChannelItem
      item={item}
      cardWidth={cardWidth}
      currentChannelUrl={currentChannelUrl}
      onPress={handleChannelChange}
      index={index}
    />
  ), [cardWidth, currentChannelUrl, handleChannelChange]);

  const keyExtractor = useCallback((item: Channel) => `${item.url}-${item.name}`, []);

  const getSectionTitle = useMemo(() => {
    if (currentChannelGroup && currentChannelGroup !== "Unknown") {
      return `More from ${currentChannelGroup}`;
    }
    return "Recommended for You";
  }, [currentChannelGroup]);

  const getChannelCount = useMemo(() => {
    if (currentChannelGroup) {
      const totalInGroup = channels.filter(ch => ch.group === currentChannelGroup).length;
      return `${recommendedChannels.length} of ${totalInGroup - 1} channels`;
    }
    return `${recommendedChannels.length} recommendations`;
  }, [channels, currentChannelGroup, recommendedChannels.length]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#edec25" />
        <Text style={styles.loadingText}>Loading recommendations...</Text>
      </View>
    );
  }

  if (recommendedChannels.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No other channels available</Text>
        <Text style={styles.emptySubText}>Try refreshing the channel list</Text>
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
            style={styles.refreshButton}
            onPress={() => {
              if (currentChannelGroup) {
                const filteredChannels = channels.filter(
                  channel => channel.group === currentChannelGroup && channel.url !== currentChannelUrl
                );
                const shuffledChannels = shuffleArray(filteredChannels).slice(0, maxRecommendations);
                setRecommendedChannels(shuffledChannels);
              }
            }}
          >
            <Text style={styles.refreshText}>Refresh</Text>
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
        snapToInterval={cardWidth + 16}
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={10}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  recommendationContainer: { 
    marginTop: 20, 
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
    marginHorizontal: 12,
  },
  recommendationTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#fff',
    letterSpacing: 0.5,
  },
  channelCount: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  refreshButton: {
    backgroundColor: 'rgba(237, 236, 37, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(237, 236, 37, 0.3)',
  },
  refreshText: {
    color: '#edec25',
    fontSize: 12,
    fontWeight: '600',
  },
  channelCard: { 
    marginHorizontal: 8, 
    borderRadius: 16, 
    overflow: 'hidden',
    ...Platform.select({ 
      ios: { 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.25, 
        shadowRadius: 4 
      }, 
      android: { 
        elevation: 6 
      } 
    }),
  },
  activeCard: {
    transform: [{ scale: 1.02 }],
    elevation: 8,
  },
  cardGradient: { 
    height: 210, 
    padding: 2, 
    borderRadius: 16,
  },
  blurContainer: { 
    flex: 1, 
    borderRadius: 14, 
    overflow: 'hidden', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  imageContainer: { 
    position: 'relative', 
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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
    borderRadius: 40,
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
    borderRadius: 40, 
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
    fontSize: 13, 
    fontWeight: '600', 
    textAlign: 'center', 
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  activeText: {
    color: '#edec25',
  },
  groupName: { 
    color: 'rgba(255,255,255,0.6)', 
    fontSize: 11, 
    textAlign: 'center',
  },
  nowPlayingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(237, 236, 37, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff4444',
  },
  nowPlayingText: {
    color: '#1e1e1e',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  emptySubText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  contentContainer: { 
    paddingRight: 10,
    paddingVertical: 4,
  },
});

export default ChannelList;