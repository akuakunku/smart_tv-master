import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { LinearGradient } from 'expo-linear-gradient';
import Colors from "../../constants/Colors";
import useM3uParse from "../../hooks/M3uParse";
import tvBanner from "../../assets/images/tv_banner.png";
import Toast from 'react-native-toast-message';
import Icon from 'react-native-vector-icons/Ionicons';

const { width: screenWidth } = Dimensions.get("window");

// --- Responsivitas: Hitung kolom berdasarkan lebar layar ---
const getNumColumns = () => {
  if (screenWidth > 900) return 6;
  if (screenWidth > 600) return 4;
  return 3;
};

const COLUMN_COUNT = getNumColumns();
const CARD_MARGIN = 8;
const CARD_WIDTH = (screenWidth - (16 * 2) - (CARD_MARGIN * (COLUMN_COUNT - 1))) / COLUMN_COUNT;

// --- Interfaces ---
interface Channel {
  tvgId?: string;
  name: string;
  group?: string;
  url: string;
  logo?: string;
}

type RootStackParamList = {
  PlayerScreen: { url: string; name?: string; logo?: string };
};

const VodScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { channels, loading, refetch } = useM3uParse();
  
  const [refreshing, setRefreshing] = useState(false);
  const [vodData, setVodData] = useState<Channel[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const slideshowRef = useRef<FlatList>(null);

  // --- VOD Filtering Logic (Optimized) ---
  const filteredVodData = useMemo(() => {
    if (!channels || channels.length === 0) return [];
    
    const keywords = [
      "movies", "movie", "film", "bioskop", "cinema", "vod", "box office", 
      "series", "netflix", "disney", "hbo", "action", "horror", "drama"
    ];

    return channels.filter((channel: Channel) => {
      const name = (channel.name || "").toLowerCase();
      const group = (channel.group || "").toLowerCase();
      return channel.url && keywords.some(k => name.includes(k) || group.includes(k));
    });
  }, [channels]);

  useEffect(() => {
    setVodData(filteredVodData);
  }, [filteredVodData]);

  const slideshowData = useMemo(() => {
    return [...vodData].sort(() => 0.5 - Math.random()).slice(0, 6);
  }, [vodData]);

  // --- Handlers ---
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    Toast.show({ type: 'success', text1: 'Daftar film diperbarui' });
  }, [refetch]);

  const handleChannelPress = useCallback((item: Channel) => {
    navigation.navigate('PlayerScreen', { 
      url: item.url, 
      name: item.name,
      logo: item.logo 
    });
  }, [navigation]);

  const handleScroll = useCallback((event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = Math.round(event.nativeEvent.contentOffset.x / slideSize);
    setCurrentIndex(index);
  }, []);

  // --- Render Functions ---
  const renderSlideItem = ({ item }: { item: Channel }) => (
    <TouchableOpacity 
      style={styles.slideCard} 
      onPress={() => handleChannelPress(item)}
      activeOpacity={0.9}
    >
      <Image 
        source={item.logo ? { uri: item.logo } : tvBanner} 
        style={styles.slideImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={styles.slideGradient}
      >
        <Text style={styles.slideCategory}>{item.group || "Premium Movie"}</Text>
        <Text style={styles.slideTitle} numberOfLines={1}>{item.name}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  const renderVodItem = useCallback(({ item, index }: { item: Channel, index: number }) => {
    // Menghilangkan margin kanan pada kolom terakhir agar sejajar
    const isLastInRow = (index + 1) % COLUMN_COUNT === 0;

    return (
      <TouchableOpacity 
        style={[styles.vodCard, { marginRight: isLastInRow ? 0 : CARD_MARGIN }]} 
        onPress={() => handleChannelPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.vodImageContainer}>
          <Image 
            source={item.logo ? { uri: item.logo } : tvBanner} 
            style={styles.vodImage}
            resizeMode="cover"
          />
          {/* Badge Kualitas (Opsional) */}
          <View style={styles.qualityBadge}>
            <Text style={styles.qualityText}>HD</Text>
          </View>
        </View>
        <Text style={styles.vodTitle} numberOfLines={2}>{item.name}</Text>
      </TouchableOpacity>
    );
  }, [handleChannelPress]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <View style={styles.container}>
        {/* Header Modern */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>Streaming</Text>
            <Text style={styles.headerTitle}>VOD Cinema</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Icon name="reload" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading && vodData.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primary || "#edec25"} />
            <Text style={styles.loadingText}>Menyiapkan katalog...</Text>
          </View>
        ) : (
          <FlatList
            data={vodData}
            keyExtractor={(item, index) => `vod-${index}`}
            numColumns={COLUMN_COUNT}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                {slideshowData.length > 0 && (
                  <View style={styles.slideshowSection}>
                    <Text style={styles.sectionTitle}>🔥 Sedang Populer</Text>
                    <FlatList
                      ref={slideshowRef}
                      data={slideshowData}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      onScroll={handleScroll}
                      renderItem={renderSlideItem}
                      keyExtractor={(item, index) => `slide-${index}`}
                      snapToAlignment="center"
                      decelerationRate="fast"
                    />
                    <View style={styles.dotContainer}>
                      {slideshowData.map((_, i) => (
                        <View key={i} style={[styles.dot, i === currentIndex && styles.activeDot]} />
                      ))}
                    </View>
                  </View>
                )}
                <Text style={styles.sectionTitle}>Semua Koleksi Film</Text>
              </View>
            }
            renderItem={renderVodItem}
            contentContainerStyle={styles.scrollPadding}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
            }
          />
        )}
      </View>
      <Toast />
    </SafeAreaView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#080808",
  },
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  headerSubtitle: {
    color: Colors.primary || "#edec25",
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
  },
  refreshBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 10,
    borderRadius: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    marginTop: 10,
    fontSize: 14,
  },
  listHeader: {
    paddingBottom: 15,
  },
  slideshowSection: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 15,
    paddingHorizontal: 16,
  },
  slideCard: {
    width: screenWidth - 32,
    height: 200,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  slideGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    justifyContent: 'flex-end',
    padding: 15,
  },
  slideCategory: {
    color: Colors.primary || "#edec25",
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  slideTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#333',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: Colors.primary || "#edec25",
    width: 15,
  },
  scrollPadding: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  vodCard: {
    width: CARD_WIDTH,
    marginBottom: 20,
  },
  vodImageContainer: {
    width: '100%',
    aspectRatio: 2/3, // Rasio Poster Film Standar
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
  },
  vodImage: {
    width: '100%',
    height: '100%',
  },
  qualityBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  vodTitle: {
    color: '#efefef',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'left',
    lineHeight: 16,
  },
});

export default VodScreen;