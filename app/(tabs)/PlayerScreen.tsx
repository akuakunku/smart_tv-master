// app/(tabs)/PlayerScreen.tsx
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
  Alert,
  Dimensions,
} from "react-native";
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native";
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import * as ScreenOrientation from 'expo-screen-orientation';
import { isValidVideoUrl } from '../../utils/videoFormats';
import VideoPlayer from "../../components/VideoPlayer";
import ChannelList from "../../components/ChannelList";
import useM3uParse, { getChannelHeaders } from "../../hooks/M3uParse";
import { useFavorites } from "../../contexts/FavoriteContext";
import Colors from "../../constants/Colors";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PlayerScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const { url: initialUrl, title: initialTitle } = route.params || {};

  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [videoKey, setVideoKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChangingChannel, setIsChangingChannel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showChannelList, setShowChannelList] = useState(true);

  const { toggleFavorite, isFavorite } = useFavorites();
  const { channels, refetch, loading: channelsLoading, error: m3uError } = useM3uParse();
  const scrollViewRef = useRef<ScrollView>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const isTablet = windowWidth >= 768;
  const isLandscape = windowWidth > windowHeight;
  const playerHeight = isLandscape && !isFullscreen ? windowHeight : undefined;
  const playerAspectRatio = isLandscape && !isFullscreen ? undefined : 16 / 9;

  const isUrlPlayable = useCallback((url: string): { playable: boolean; reason?: string } => {
    if (!url) return { playable: false, reason: "URL kosong" };

    const urlLower = url.toLowerCase();

    if (urlLower.includes('raw.githubusercontent.com') || urlLower.includes('pastebin.com')) {
      return { playable: false, reason: "URL ini adalah playlist, bukan stream video" };
    }

    const supportedFormats = ['.m3u8', '.mpd', '.ts', '.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv'];
    const hasValidFormat = supportedFormats.some(format => urlLower.includes(format));

    if (!hasValidFormat) {
      return { playable: false, reason: "Format video tidak didukung" };
    }

    if (urlLower.includes('.mpd')) {
      const channel = channels.find(c => c.url === url);
      const isEncrypted = urlLower.includes('cenc') || urlLower.includes('/enc/');
      if (isEncrypted && (!channel?.licenseType || !channel?.licenseKey)) {
        return { playable: false, reason: "Stream DASH terenkripsi tidak dapat diputar" };
      }
      if (channel && (!channel.licenseType || !channel.licenseKey)) {
        return { playable: false, reason: "Stream DASH memerlukan lisensi DRM" };
      }
    }
    
    try {
      new URL(url);
      return { playable: true };
    } catch {
      return { playable: false, reason: "URL tidak valid" };
    }
  }, [channels]);

  useEffect(() => {
    if (initialUrl && initialUrl !== currentUrl) {
      const { playable, reason } = isUrlPlayable(initialUrl);
      if (!playable) {
        setUrlError(reason);
        Toast.show({
          type: "error",
          text1: "Tidak Dapat Diputar",
          text2: reason,
          position: 'bottom',
          visibilityTime: 3000,
        });
        return;
      }

      setUrlError(null);
      setCurrentUrl(initialUrl);
      setVideoKey(prev => prev + 1);
      setIsChangingChannel(false);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });

      Toast.show({
        type: "info",
        text1: "Berganti Channel",
        text2: initialTitle || "Channel",
        position: 'bottom',
        visibilityTime: 1500,
      });
    }
  }, [initialUrl, initialTitle, currentUrl, isUrlPlayable]);

  useEffect(() => {
    if (!initialUrl) {
      setUrlError("Tidak ada URL channel yang dipilih");
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Tidak ada URL channel yang dipilih",
        position: 'bottom',
        visibilityTime: 3000,
      });
      setTimeout(() => navigation.goBack(), 2000);
    } else {
      const { playable, reason } = isUrlPlayable(initialUrl);
      if (!playable) setUrlError(reason);
    }
  }, []);

  const validChannels = useMemo(() =>
    channels.filter(channel => isValidVideoUrl(channel.url)), [channels]
  );

  const playableChannels = useMemo(() =>
    validChannels.filter(c => {
      if (c.isHLS) return true;
      if (!c.isDASH && !c.isHLS) return true;
      if (c.isDASH) {
        const hasValidLicense = c.licenseType && c.licenseKey;
        if (!hasValidLicense) return false;
        try {
          new URL(c.licenseKey!);
          return true;
        } catch {
          return false;
        }
      }
      return true;
    }), [validChannels]
  );

  const selectedChannel = useMemo(() =>
    playableChannels.find((c) => c.url === currentUrl), [playableChannels, currentUrl]
  );

  const channelName = selectedChannel?.name || initialTitle || "Unknown Channel";
  const channelHeaders = selectedChannel ? getChannelHeaders(selectedChannel) : {};

  const manageOrientation = useCallback(async () => {
    try {
      if (isFullscreen) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
        StatusBar.setHidden(true, 'fade');
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        StatusBar.setHidden(false, 'fade');
      }
    } catch (error) {
      console.log('Orientation error:', error);
    }
  }, [isFullscreen]);

  const configureUI = useCallback(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    configureUI();
    manageOrientation();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
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
    if (newUrl === currentUrl) return;

    const { playable, reason } = isUrlPlayable(newUrl);
    if (!playable) {
      Toast.show({
        type: "error",
        text1: "Tidak Dapat Diputar",
        text2: reason,
        position: 'bottom',
        visibilityTime: 2000,
      });
      return;
    }

    setIsChangingChannel(true);
    setCurrentUrl(newUrl);
    setVideoKey(prev => prev + 1);
    setUrlError(null);
    navigation.setParams({ url: newUrl });
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });

    const newChannel = playableChannels.find(c => c.url === newUrl);
    if (newChannel) {
      Toast.show({
        type: "info",
        text1: "Berganti Channel",
        text2: newChannel.name,
        position: 'bottom',
        visibilityTime: 1500,
      });
    }

    setTimeout(() => setIsChangingChannel(false), 500);
  }, [currentUrl, navigation, playableChannels, isUrlPlayable]);

  const handleToggleFavorite = useCallback(() => {
    if (!selectedChannel) return;
    const isCurrentlyFav = isFavorite(currentUrl);
    toggleFavorite(selectedChannel);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    Toast.show({
      type: isCurrentlyFav ? "error" : "success",
      text1: isCurrentlyFav ? "Dihapus dari Favorit" : "Ditambah ke Favorit",
      text2: channelName,
      position: 'bottom',
      visibilityTime: 2000,
    });
  }, [selectedChannel, isFavorite, currentUrl, toggleFavorite, channelName]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      Toast.show({
        type: "success",
        text1: "Refresh Berhasil",
        text2: `${playableChannels.length} channel tersedia`,
        position: 'bottom',
        visibilityTime: 1500,
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Refresh Gagal",
        text2: "Periksa koneksi internet",
        position: 'bottom',
        visibilityTime: 2000,
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, playableChannels.length]);

  const handleShareChannel = useCallback(() => {
    if (!selectedChannel) return;
    Alert.alert(
      "Bagikan Channel",
      `Nama: ${selectedChannel.name}\nGroup: ${selectedChannel.group || 'TV'}`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Salin URL",
          onPress: () => {
            Toast.show({
              type: "success",
              text1: "URL Disalin",
              position: 'bottom',
              visibilityTime: 1500,
            });
          }
        }
      ]
    );
  }, [selectedChannel]);

  const toggleChannelList = useCallback(() => {
    setShowChannelList(prev => !prev);
  }, []);

  // Error states
  if (urlError) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="video-off" size={64} color="#ff4444" />
        <Text style={styles.errorText}>Stream Tidak Dapat Diputar</Text>
        <Text style={styles.errorSubText}>{urlError}</Text>
        <Text style={styles.errorSubTextSmall}>{currentUrl?.substring(0, 80)}...</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Kembali ke Daftar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!initialUrl && !currentUrl) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="alert-circle" size={64} color="#ff4444" />
        <Text style={styles.errorText}>Tidak ada channel yang dipilih</Text>
        <Text style={styles.errorSubText}>Silakan pilih channel dari daftar</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (channelsLoading && channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Memuat daftar channel...</Text>
        <Text style={styles.loadingSubText}>Mohon tunggu sebentar</Text>
      </View>
    );
  }

  if (m3uError && channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="wifi-off" size={64} color="#444" />
        <Text style={styles.errorText}>Gagal Memuat Channel</Text>
        <Text style={styles.errorSubText}>{m3uError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Coba Lagi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.backButton, { marginTop: 12, backgroundColor: '#333' }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.backButtonText, { color: '#fff' }]}>Kembali</Text>
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
      >
        <View style={[
          isFullscreen ? styles.playerFullscreen : styles.playerPortrait,
          playerHeight && { height: playerHeight },
          playerAspectRatio && { aspectRatio: playerAspectRatio }
        ]}>
          <VideoPlayer
            key={`${currentUrl}-${videoKey}`}
            url={currentUrl}
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
              isFavorite={isFavorite(currentUrl)}
              onToggleFavorite={handleToggleFavorite}
              onShare={handleShareChannel}
              isTablet={isTablet}
              titleFontSize={titleFontSize}
              cardPadding={cardPadding}
            />

            <Section
              icon="format-list-bulleted"
              title="Daftar Channel"
              rightElement={
                <TouchableOpacity onPress={toggleChannelList} style={styles.toggleButton}>
                  <Text style={styles.toggleButtonText}>
                    {showChannelList ? 'Sembunyikan' : 'Tampilkan'}
                  </Text>
                  <Ionicons 
                    name={showChannelList ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color={Colors.primary} 
                  />
                </TouchableOpacity>
              }
              isTablet={isTablet}
            >
              {showChannelList && (
                <>
                  <View style={styles.totalContainer}>
                    <Text style={[styles.countText, isTablet && styles.tabletCountText]}>
                      {playableChannels.length} Channel Tersedia
                    </Text>
                  </View>
                  <ChannelList
                    channels={playableChannels}
                    currentChannelUrl={currentUrl}
                    onChannelSelect={handleChannelChange}
                  />
                </>
              )}
            </Section>
          </View>
        )}
      </ScrollView>

      {!isFullscreen && (
        <View style={[styles.bottomSpacer, { height: insets.bottom + (isTablet ? 80 : 70) }]} />
      )}

      {isChangingChannel && (
        <View style={styles.changingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.changingText}>Mengganti channel...</Text>
        </View>
      )}
    </View>
  );
};

// ChannelInfoCard Component
interface ChannelInfoCardProps {
  channelName: string;
  group?: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  isTablet?: boolean;
  titleFontSize?: number;
  cardPadding?: number;
}

const ChannelInfoCard: React.FC<ChannelInfoCardProps> = React.memo(({
  channelName,
  group,
  isFavorite,
  onToggleFavorite,
  onShare,
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

    <View style={styles.actionButtons}>
      <TouchableOpacity onPress={onShare} style={[styles.actionBtn, isTablet && styles.tabletActionBtn]} activeOpacity={0.7}>
        <Ionicons name="share-outline" size={isTablet ? 24 : 20} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onToggleFavorite} style={[styles.actionBtn, isTablet && styles.tabletActionBtn, isFavorite && styles.favBtnActive]} activeOpacity={0.7}>
        <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={isTablet ? 24 : 20} color={isFavorite ? "#ff4444" : "#fff"} />
      </TouchableOpacity>
    </View>
  </View>
));

// Section Component
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
        <MaterialCommunityIcons name={icon as any} size={isTablet ? 22 : 18} color={Colors.primary} />
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
  loadingSubText: {
    color: '#666',
    marginTop: 4,
    fontSize: 12,
  },
  errorText: {
    color: '#ff4444',
    marginTop: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorSubText: {
    color: '#888',
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  errorSubTextSmall: {
    color: '#666',
    marginTop: 8,
    fontSize: 10,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  backButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  retryButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  retryButtonText: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  playerPortrait: {
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
    gap: 8,
  },
  badge: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
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
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabletActionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  favBtnActive: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
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
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  countText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  tabletCountText: {
    fontSize: 14,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  toggleButtonText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '500',
  },
  bottomSpacer: {
    backgroundColor: '#000',
  },
  changingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  changingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
  },
});

export default PlayerScreen;