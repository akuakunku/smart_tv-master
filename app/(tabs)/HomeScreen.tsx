import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  View, Text, ScrollView, Image, TouchableOpacity, FlatList, 
  Animated, Dimensions, RefreshControl, StyleSheet, Platform,
  ImageBackground, StatusBar, useWindowDimensions
} from "react-native";
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import Colors from "../../constants/Colors";
import useM3uParse from "../../hooks/M3uParse";
import { useFavorites } from "../../contexts/FavoriteContext";
import tvBanner from "../../assets/images/tv_banner.png";

const { width, height } = Dimensions.get("window");

export default function Home() {
  const { channels, loading, refetch } = useM3uParse();
  const { toggleFavorite, isFavorite } = useFavorites();
  const [isLoading, setIsLoading] = useState(true);
  const [errorImages, setErrorImages] = useState<{ [key: string]: boolean }>({});
  const [refreshing, setRefreshing] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const navigation = useNavigation<any>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const slideshowRef = useRef<FlatList>(null);

  // Responsive values
  const isTablet = windowWidth >= 768;
  const isLandscape = windowWidth > windowHeight;
  const CARD_WIDTH = isTablet ? windowWidth * 0.28 : windowWidth * 0.42;
  const CARD_HEIGHT = CARD_WIDTH * 0.6;
  const HERO_HEIGHT = isLandscape ? windowHeight * 0.7 : windowHeight * 0.55;
  const SECTION_TITLE_SIZE = isTablet ? 20 : 17;

  const [sections, setSections] = useState({
    slideshow: [],
    sports: [],
    radio: [],
    recommendations: []
  });

  const updateAllSections = useCallback(() => {
    if (!channels || channels.length === 0) return;

    const getRandom = (arr: any[], n: number) => [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
    const filterChannels = (k: string[]) => channels.filter(item => 
      item.group && k.some(key => item.group.toLowerCase().includes(key.toLowerCase()))
    );

    setSections({
      slideshow: getRandom(channels, 6),
      sports: filterChannels(["sport", "bola", "liga", "ufc", "football", "beIn"]).slice(0, isTablet ? 25 : 15),
      radio: filterChannels(["radio", "musik", "music", "fm"]).slice(0, isTablet ? 25 : 15),
      recommendations: getRandom(channels, isTablet ? 30 : 20)
    });
  }, [channels, isTablet]);

  useEffect(() => {
    if (!loading && channels?.length > 0) {
      updateAllSections();
      setIsLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    }
  }, [channels, loading, updateAllSections, fadeAnim]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch?.();
    updateAllSections();
    setRefreshing(false);
  };

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Handle scroll untuk dot indicator
  const handleSlideScroll = (event: any) => {
    const slideWidth = event.nativeEvent.layoutMeasurement.width;
    const index = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    setCurrentSlideIndex(index);
  };

  const renderFeaturedSlide = ({ item }: any) => (
    <View style={[styles.heroSlide, { width: windowWidth, height: HERO_HEIGHT }]}>
      <ImageBackground
        source={item.logo && !errorImages[item.url] ? { uri: item.logo } : tvBanner}
        style={styles.heroImage}
        onError={() => setErrorImages(prev => ({ ...prev, [item.url]: true }))}
      >
        <LinearGradient
          colors={['rgba(5,5,5,0.1)', 'rgba(5,5,5,0.6)', '#050505']}
          style={styles.heroGradient}
        >
          <View style={[styles.heroContent, isTablet && styles.tabletHeroContent]}>
            <View style={[styles.featuredBadge, isTablet && styles.tabletFeaturedBadge]}>
              <Text style={[styles.featuredBadgeText, isTablet && styles.tabletFeaturedBadgeText]}>TOP PICK</Text>
            </View>
            <Text style={[styles.heroTitle, isTablet && styles.tabletHeroTitle]} numberOfLines={isTablet ? 3 : 2}>
              {item.name}
            </Text>
            
            <View style={[styles.heroActionRow, isTablet && styles.tabletHeroActionRow]}>
              <TouchableOpacity 
                style={[styles.btnPlayPrimary, isTablet && styles.tabletBtnPlayPrimary]} 
                onPress={() => navigation.navigate('PlayerScreen', { url: item.url })}
              >
                <Ionicons name="play" size={isTablet ? 24 : 20} color="#000" />
                <Text style={[styles.btnPlayText, isTablet && styles.tabletBtnPlayText]}>Tonton Sekarang</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.btnCircle, isTablet && styles.tabletBtnCircle, isFavorite(item.url) && { borderColor: Colors.primary }]} 
                onPress={() => toggleFavorite(item)}
              >
                <Ionicons 
                  name={isFavorite(item.url) ? "checkmark" : "add-outline"} 
                  size={isTablet ? 28 : 24} 
                  color={isFavorite(item.url) ? Colors.primary : "#fff"} 
                />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );

  const renderChannelCard = ({ item }: any) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.channelCard, { width: CARD_WIDTH, marginRight: isTablet ? 20 : 15 }]}
      onPress={() => navigation.navigate('PlayerScreen', { url: item.url })}
    >
      <View style={[styles.imageContainer, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>
        <Image
          source={item.logo && !errorImages[item.url] ? { uri: item.logo } : tvBanner}
          style={styles.cardImage}
          onError={() => setErrorImages(prev => ({ ...prev, [item.url]: true }))}
        />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.cardOverlay} />
      </View>
      <Text style={[styles.cardTitle, isTablet && styles.tabletCardTitle]} numberOfLines={1}>{item.name}</Text>
      <Text style={[styles.cardSubtitle, isTablet && styles.tabletCardSubtitle]}>{item.group || 'Live Channel'}</Text>
    </TouchableOpacity>
  );

  // Render dot indicator
  const renderDotIndicator = () => {
    if (sections.slideshow.length <= 1) return null;
    
    return (
      <View style={styles.dotContainer}>
        {sections.slideshow.map((_, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.dot,
              currentSlideIndex === index && styles.activeDot,
              isTablet && styles.tabletDot
            ]}
            onPress={() => {
              if (slideshowRef.current) {
                const slideWidth = windowWidth;
                slideshowRef.current.scrollToOffset({
                  offset: slideWidth * index,
                  animated: true
                });
              }
            }}
          />
        ))}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar barStyle="light-content" />
        <Text style={[styles.loadingBrand, isTablet && styles.tabletLoadingBrand]}>
          CHESKO<Text style={{color: Colors.primary}}>TV</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <Animated.View style={[styles.headerFloating, { opacity: headerBgOpacity }]}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View style={[styles.headerContentFixed, isTablet && styles.tabletHeaderContentFixed]}>
        <TouchableOpacity style={[styles.navIcon, isTablet && styles.tabletNavIcon]} onPress={() => navigation.openDrawer()}>
          <Ionicons name="menu-outline" size={isTablet ? 34 : 30} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerLogoText, isTablet && styles.tabletHeaderLogoText]}>
          CHESKO<Text style={{color: Colors.primary}}>TV</Text>
        </Text>
        <TouchableOpacity style={[styles.navIcon, isTablet && styles.tabletNavIcon]} onPress={() => navigation.navigate("SearchScreen")}>
          <Ionicons name="search-outline" size={isTablet ? 30 : 26} color="#fff" />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Slideshow Section with Dot Indicator */}
        <View>
          <FlatList
            ref={slideshowRef}
            data={sections.slideshow}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={renderFeaturedSlide}
            keyExtractor={(_, i) => `hero-${i}`}
            onScroll={handleSlideScroll}
            scrollEventThrottle={16}
          />
          {renderDotIndicator()}
        </View>

        <View style={[styles.modernNav, isTablet && styles.tabletModernNav]}>
          <NavAction 
            title="Live TV" 
            icon="tv" 
            color="#FF3B30" 
            onPress={() => navigation.navigate("LiveTvScreen")}
            isTablet={isTablet}
          />
          <NavAction 
            title="Movies" 
            icon="film" 
            color="#5856D6" 
            onPress={() => navigation.navigate("VodScreen")}
            isTablet={isTablet}
          />
          <NavAction 
            title="Favorit" 
            icon="heart" 
            color="#FFCC00" 
            onPress={() => navigation.navigate("FavoriteScreen")}
            isTablet={isTablet}
          />
          <NavAction 
            title="Profil" 
            icon="person" 
            color="#4CD964" 
            onPress={() => navigation.navigate("ProfileScreen")}
            isTablet={isTablet}
          />
        </View>

        <Section 
          title="🏆 LIVE SPORTS" 
          data={sections.sports} 
          renderItem={renderChannelCard} 
          onSeeAll={() => navigation.navigate("LiveTvScreen", { initialFilter: 'Sports' })}
          isTablet={isTablet}
          sectionTitleSize={SECTION_TITLE_SIZE}
        />
        
        <Section 
          title="✨ REKOMENDASI" 
          data={sections.recommendations} 
          renderItem={renderChannelCard} 
          onSeeAll={() => navigation.navigate("LiveTvScreen")}
          isTablet={isTablet}
          sectionTitleSize={SECTION_TITLE_SIZE}
        />

        <Section 
          title="📻 RADIO & MUSIC" 
          data={sections.radio} 
          renderItem={renderChannelCard} 
          onSeeAll={() => navigation.navigate("LiveTvScreen", { initialFilter: 'Music' })}
          isTablet={isTablet}
          sectionTitleSize={SECTION_TITLE_SIZE}
        />

        <View style={{ height: isTablet ? 120 : 100 }} />
      </Animated.ScrollView>
    </View>
  );
}

// NavAction component
const NavAction = ({ title, icon, color, onPress, isTablet }: any) => (
  <TouchableOpacity style={[styles.qaItem, isTablet && styles.tabletQaItem]} onPress={onPress}>
    <View style={[styles.qaIconBg, isTablet && styles.tabletQaIconBg, { backgroundColor: color + '25' }]}>
      <Ionicons name={icon as any} size={isTablet ? 28 : 24} color={color} />
    </View>
    <Text style={[styles.qaText, isTablet && styles.tabletQaText]}>{title}</Text>
  </TouchableOpacity>
);

// Section component
const Section = ({ title, data, renderItem, onSeeAll, isTablet, sectionTitleSize }: any) => (
  data.length > 0 ? (
    <View style={[styles.sectionWrap, isTablet && styles.tabletSectionWrap]}>
      <View style={[styles.sectionHead, isTablet && styles.tabletSectionHead]}>
        <Text style={[styles.sectionTitleText, isTablet && styles.tabletSectionTitleText, sectionTitleSize && { fontSize: sectionTitleSize }]}>
          {title}
        </Text>
        <TouchableOpacity onPress={onSeeAll}>
          <Text style={[styles.btnSeeAll, isTablet && styles.tabletBtnSeeAll]}>Lihat Semua</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: isTablet ? 32 : 20, paddingRight: isTablet ? 32 : 0 }}
        renderItem={renderItem}
        keyExtractor={(_, i) => `item-${i}`}
      />
    </View>
  ) : null
);

const styles = StyleSheet.create({
  mainContainer: { 
    flex: 1, 
    backgroundColor: '#050505' 
  },
  headerFloating: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: Platform.OS === 'ios' ? 100 : 90, 
    zIndex: 20 
  },
  headerContentFixed: { 
    position: 'absolute', 
    top: Platform.OS === 'ios' ? 50 : 40, 
    left: 0, 
    right: 0, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    zIndex: 30 
  },
  tabletHeaderContentFixed: {
    top: Platform.OS === 'ios' ? 60 : 50,
    paddingHorizontal: 32,
  },
  headerLogoText: { 
    color: '#fff', 
    fontSize: 22, 
    fontWeight: '900', 
    letterSpacing: 1 
  },
  tabletHeaderLogoText: {
    fontSize: 28,
  },
  navIcon: { 
    width: 44, 
    height: 44, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  tabletNavIcon: {
    width: 54,
    height: 54,
  },
  heroSlide: { 
    height: height * 0.55 
  },
  heroImage: { 
    flex: 1, 
    width: '100%' 
  },
  heroGradient: { 
    flex: 1, 
    justifyContent: 'flex-end', 
    padding: 25 
  },
  heroContent: { 
    marginBottom: 20 
  },
  tabletHeroContent: {
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  featuredBadge: { 
    backgroundColor: Colors.primary, 
    alignSelf: 'flex-start', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 4, 
    marginBottom: 10 
  },
  tabletFeaturedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 15,
  },
  featuredBadgeText: { 
    color: '#000', 
    fontSize: 10, 
    fontWeight: 'bold' 
  },
  tabletFeaturedBadgeText: {
    fontSize: 12,
  },
  heroTitle: { 
    color: '#fff', 
    fontSize: 34, 
    fontWeight: '900', 
    marginBottom: 20 
  },
  tabletHeroTitle: {
    fontSize: 48,
    marginBottom: 30,
  },
  heroActionRow: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  tabletHeroActionRow: {
    gap: 20,
  },
  btnPlayPrimary: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    paddingHorizontal: 24, 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginRight: 15 
  },
  tabletBtnPlayPrimary: {
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 16,
    marginRight: 20,
  },
  btnPlayText: { 
    color: '#000', 
    fontWeight: '900', 
    marginLeft: 8, 
    fontSize: 15 
  },
  tabletBtnPlayText: {
    fontSize: 18,
    marginLeft: 12,
  },
  btnCircle: { 
    width: 52, 
    height: 52, 
    borderRadius: 26, 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1.5, 
    borderColor: 'rgba(255,255,255,0.3)' 
  },
  tabletBtnCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  modernNav: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    paddingVertical: 25, 
    backgroundColor: '#050505', 
    marginTop: -30, 
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30 
  },
  tabletModernNav: {
    paddingVertical: 35,
    marginTop: -40,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingHorizontal: 20,
  },
  qaItem: { 
    alignItems: 'center' 
  },
  tabletQaItem: {
    flex: 1,
    alignItems: 'center',
  },
  qaIconBg: { 
    width: 60, 
    height: 60, 
    borderRadius: 20, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 10 
  },
  tabletQaIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    marginBottom: 12,
  },
  qaText: { 
    color: '#999', 
    fontSize: 12, 
    fontWeight: '700' 
  },
  tabletQaText: {
    fontSize: 14,
  },
  sectionWrap: { 
    marginVertical: 15 
  },
  tabletSectionWrap: {
    marginVertical: 25,
  },
  sectionHead: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    marginBottom: 15 
  },
  tabletSectionHead: {
    paddingHorizontal: 32,
    marginBottom: 20,
  },
  sectionTitleText: { 
    color: '#fff', 
    fontSize: 17, 
    fontWeight: '900', 
    letterSpacing: 0.5 
  },
  tabletSectionTitleText: {
    fontSize: 20,
  },
  btnSeeAll: { 
    color: Colors.primary, 
    fontSize: 13, 
    fontWeight: '700' 
  },
  tabletBtnSeeAll: {
    fontSize: 15,
  },
  channelCard: { 
    marginRight: 15 
  },
  imageContainer: { 
    borderRadius: 15, 
    overflow: 'hidden', 
    backgroundColor: '#1a1a1a', 
    borderWidth: 1, 
    borderColor: '#222' 
  },
  cardImage: { 
    width: '100%', 
    height: '100%', 
    resizeMode: 'cover' 
  },
  cardOverlay: { 
    ...StyleSheet.absoluteFillObject 
  },
  cardTitle: { 
    color: '#fff', 
    fontSize: 14, 
    fontWeight: '700', 
    marginTop: 10 
  },
  tabletCardTitle: {
    fontSize: 16,
    marginTop: 12,
  },
  cardSubtitle: { 
    color: '#555', 
    fontSize: 11, 
    marginTop: 2, 
    fontWeight: '600' 
  },
  tabletCardSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  loadingScreen: { 
    flex: 1, 
    backgroundColor: '#000', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  loadingBrand: { 
    color: '#fff', 
    fontSize: 26, 
    fontWeight: '900', 
    letterSpacing: 6 
  },
  tabletLoadingBrand: {
    fontSize: 34,
    letterSpacing: 8,
  },
  // Dot Indicator Styles
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: Colors.primary,
  },
  tabletDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 6,
  },
});
