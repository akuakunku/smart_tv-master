import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  Text,
  StatusBar,
  ScrollView,
  RefreshControl,
  BackHandler,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native";
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import * as ScreenOrientation from 'expo-screen-orientation';

import VideoPlayer from "../../components/VideoPlayer";
import EPGInfo from "../../components/EPGInfo";
import ChannelList from "../../components/ChannelList";
import useM3uParse, { getChannelHeaders } from "../../hooks/M3uParse";
import { useFavorites } from "../../contexts/FavoriteContext";
import Colors from "../../constants/Colors";

const PlayerScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const { url } = route.params || {};
  const { toggleFavorite, isFavorite } = useFavorites();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoKey, setVideoKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { channels, refetch, loading: channelsLoading } = useM3uParse();
  const scrollViewRef = useRef<ScrollView>(null);

  const selectedChannel = useMemo(() =>
    channels.find((c) => c.url === url), [channels, url]
  );

  const channelName = selectedChannel?.name || "Unknown Channel";
  const channelHeaders = selectedChannel ? getChannelHeaders(selectedChannel) : {};

  const isTablet = windowWidth >= 768;

  const manageOrientation = useCallback(async () => {
    if (isFullscreen) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
      StatusBar.setHidden(true, 'fade');
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false, 'fade');
    }
  }, [isFullscreen]);

  const configureUI = useCallback(() => {
    navigation.setOptions({
      headerShown: false,
      tabBarStyle: isFullscreen
        ? { display: 'none' }
        : styles.tabBarStyle,
    });
  }, [isFullscreen, navigation]);

  useEffect(() => {
    configureUI();
    manageOrientation();

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => { });
      StatusBar.setHidden(false, 'fade');
    };
  }, [isFullscreen, configureUI, manageOrientation]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isFullscreen) {
          setIsFullscreen(false);
          return true;
        }
        return false;
      };
      BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress);
    }, [isFullscreen])
  );

  const handleChannelChange = useCallback((newUrl: string) => {
    if (newUrl === url) return;
    setVideoKey(v => v + 1);
    navigation.setParams({ url: newUrl });
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, [url, navigation]);

  const handleToggleFavorite = useCallback(() => {
    if (!selectedChannel) return;
    const isCurrentlyFav = isFavorite(url);
    toggleFavorite(selectedChannel);
    Toast.show({
      type: "success",
      text1: isCurrentlyFav ? "Dihapus dari Favorit" : "Ditambah ke Favorit",
      text2: channelName,
      position: 'bottom',
      visibilityTime: 2000,
    });
  }, [selectedChannel, isFavorite, url, toggleFavorite, channelName]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  if (channelsLoading && channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Memuat daftar channel...</Text>
      </View>
    );
  }

  if (!selectedChannel && !channelsLoading) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="television-off" size={64} color="#444" />
        <Text style={styles.errorText}>Channel tidak ditemukan</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const bodyPadding = isTablet ? 32 : 20;
  const cardPadding = isTablet ? 24 : 18;
  const titleFontSize = isTablet ? 24 : 20;

  return (
    <View style={[styles.root, isFullscreen && styles.rootFullscreen]}>
      {!isFullscreen && (
        <View style={[styles.statusBarSpacer, { height: insets.top }]}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        scrollEnabled={!isFullscreen}
        style={styles.scrollView}
        contentContainerStyle={[
          isFullscreen ? styles.fullscreenContent : styles.scrollContent,
          isTablet && !isFullscreen && styles.tabletScrollContent
        ]}
        refreshControl={
          !isFullscreen ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
              progressBackgroundColor="#111"
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={isFullscreen ? styles.playerFullscreen : styles.playerPortrait}>
          <VideoPlayer
            key={videoKey > 0 ? `${url}-${videoKey}` : url}
            url={url}
            isFullscreen={isFullscreen}
            onFullscreenChange={setIsFullscreen}
            title={channelName}
            onReload={() => setVideoKey(prev => prev + 1)}
            licenseType={selectedChannel?.licenseType}
            licenseKey={selectedChannel?.licenseKey}
            userAgent={channelHeaders['User-Agent']}
            referrer={channelHeaders['Referer']}
            origin={channelHeaders['Origin']}
          />
        </View>

        {!isFullscreen && (
          <View style={[styles.body, { padding: bodyPadding }]}>
            <ChannelInfoCard
              channelName={channelName}
              group={selectedChannel?.group}
              isFavorite={isFavorite(url)}
              onToggleFavorite={handleToggleFavorite}
              isTablet={isTablet}
              titleFontSize={titleFontSize}
              cardPadding={cardPadding}
            />

            <Section
              icon="calendar-clock"
              title="EPG / Jadwal"
              rightElement={null}
              isTablet={isTablet}
            >
              <EPGInfo tvgId={selectedChannel?.tvgId} channelName={channelName} />
            </Section>

            <ChannelList
              channels={channels}
              currentChannelUrl={url}
              onChannelSelect={handleChannelChange}
            />
          </View>
        )}
      </ScrollView>

      {!isFullscreen && (
        <View style={[
          styles.bottomSpacer,
          {
            height: insets.bottom + (isTablet ? 80 : 70),
          }
        ]} />
      )}
    </View>
  );
};

interface ChannelInfoCardProps {
  channelName: string;
  group?: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  isTablet?: boolean;
  titleFontSize?: number;
  cardPadding?: number;
}

const ChannelInfoCard: React.FC<ChannelInfoCardProps> = React.memo(({
  channelName,
  group,
  isFavorite,
  onToggleFavorite,
  isTablet,
  titleFontSize,
  cardPadding
}) => (
  <View style={[
    styles.infoCard,
    isTablet && styles.tabletInfoCard,
    cardPadding && { padding: cardPadding }
  ]}>
    <View style={styles.infoCardContent}>
      <Text style={[
        styles.mainTitle,
        isTablet && styles.tabletMainTitle,
        titleFontSize && { fontSize: titleFontSize }
      ]} numberOfLines={isTablet ? 3 : 2}>
        {channelName}
      </Text>
      <View style={styles.badgeContainer}>
        <View style={styles.badge}>
          <Text style={[styles.badgeText, isTablet && styles.tabletBadgeText]}>
            {group || "TV"}
          </Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
          <Text style={[styles.liveText, { color: Colors.primary }, isTablet && styles.tabletLiveText]}>
            LIVE
          </Text>
        </View>
      </View>
    </View>

    <TouchableOpacity
      onPress={onToggleFavorite}
      style={[styles.favBtn, isTablet && styles.tabletFavBtn]}
      activeOpacity={0.7}
    >
      <Ionicons
        name={isFavorite ? "heart" : "heart-outline"}
        size={isTablet ? 32 : 26}
        color={isFavorite ? "#ff4444" : "#fff"}
      />
    </TouchableOpacity>
  </View>
));

interface SectionProps {
  icon: string;
  title: string;
  rightElement?: React.ReactNode;
  children: React.ReactNode;
  isTablet?: boolean;
}

const Section: React.FC<SectionProps> = React.memo(({
  icon,
  title,
  rightElement,
  children,
  isTablet
}) => (
  <View style={[styles.section, isTablet && styles.tabletSection]}>
    <View style={[styles.sectionHeader, isTablet && styles.tabletSectionHeader]}>
      <View style={[styles.iconBox, isTablet && styles.tabletIconBox]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={isTablet ? 22 : 18}
          color={Colors.primary}
        />
      </View>
      <Text style={[styles.sectionTitle, isTablet && styles.tabletSectionTitle]}>
        {title}
      </Text>
      {rightElement}
    </View>
    {children}
  </View>
));

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  rootFullscreen: {
    backgroundColor: "#000",
  },
  statusBarSpacer: {
    backgroundColor: '#000',
  },
  scrollView: {
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
  },
  tabletScrollContent: {
    paddingHorizontal: 0,
  },
  fullscreenContent: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  playerPortrait: {
    aspectRatio: 16 / 9,
    width: '100%',
    backgroundColor: '#000',
  },
  playerFullscreen: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  body: {
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  tabletInfoCard: {
    borderRadius: 24,
    marginBottom: 32,
  },
  infoCardContent: {
    flex: 1,
  },
  mainTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    paddingRight: 10,
  },
  tabletMainTitle: {
    fontSize: 24,
    marginBottom: 12,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 10,
    marginBottom: 4,
  },
  badgeText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
  },
  tabletBadgeText: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '900',
  },
  tabletLiveText: {
    fontSize: 12,
  },
  favBtn: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabletFavBtn: {
    width: 60,
    height: 60,
    borderRadius: 20,
  },
  section: {
    marginBottom: 30,
  },
  tabletSection: {
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 10,
    flexWrap: 'wrap',
  },
  tabletSectionHeader: {
    marginBottom: 20,
    gap: 12,
  },
  iconBox: {
    width: 34,
    height: 34,
    backgroundColor: '#111',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  tabletIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  tabletSectionTitle: {
    fontSize: 18,
  },
  totalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  tabletCountText: {
    fontSize: 14,
  },
  bottomSpacer: {
    backgroundColor: '#000',
  },
  tabBarStyle: {
    backgroundColor: "#0a0a0a",
    borderTopColor: "#222",
    height: Platform.OS === 'ios' ? 90 : 70,
    paddingBottom: Platform.OS === 'ios' ? 25 : 12,
  },
});

export default PlayerScreen;