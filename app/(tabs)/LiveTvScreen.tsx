import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ImageBackground,
  RefreshControl,
  SafeAreaView,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import useM3uParse from "../../hooks/M3uParse";
import LiveTVCard from "../../components/LiveTVCard";
import Colors from "../../constants/Colors";
import DEFAULT_CATEGORY_IMAGE from "../../assets/images/maskable.png";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LottieView from 'lottie-react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const LiveTV = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { channels, groups, loading, error, refetch } = useM3uParse();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);

  // Filter channels by selected group and search query
  const filteredChannels = useMemo(() => {
    let result = selectedGroup ? channels.filter((ch) => ch.group === selectedGroup) : [];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(ch => 
        ch.name.toLowerCase().includes(query) ||
        ch.group?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [channels, selectedGroup, searchQuery]);

  // Sort groups alphabetically
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.localeCompare(b));
  }, [groups]);

  // Get channel count per group
  const getChannelCount = useCallback((group: string) => {
    return channels.filter(ch => ch.group === group).length;
  }, [channels]);

  const hideTabBar = useCallback(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({
        tabBarStyle: { display: "none" },
      });
    }
  }, [navigation]);

  const showTabBar = useCallback(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({
        tabBarStyle: undefined,
      });
    }
  }, [navigation]);

  // Fade in animation when component mounts
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Handle tab bar visibility on focus/blur
  useFocusEffect(
    useCallback(() => {
      if (selectedGroup) {
        hideTabBar();
      }
      return () => {
        if (selectedGroup) {
          showTabBar();
        }
      };
    }, [selectedGroup, hideTabBar, showTabBar])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.error("Error refreshing:", error);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleGroupSelect = useCallback((group: string) => {
    setSelectedGroup(group);
    setSearchQuery("");
    hideTabBar();
    // Scroll to top when group selected
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);
  }, [hideTabBar]);

  const handleBack = useCallback(() => {
    setSelectedGroup(null);
    setSearchQuery("");
    showTabBar();
  }, [showTabBar]);

  const handleChannelPress = useCallback((url: string) => {
    navigation.navigate('PlayerScreen', { url });
  }, [navigation]);

  const renderChannelItem = useCallback(({ item }: { item: any }) => (
    <LiveTVCard
      channel={item}
      isActive={false}
      onPress={() => handleChannelPress(item.url)}
    />
  ), [handleChannelPress]);

  const renderGroupItem = useCallback(({ item }: { item: string }) => {
    const channelCount = getChannelCount(item);
    return (
      <TouchableOpacity
        style={styles.groupCard}
        onPress={() => handleGroupSelect(item)}
        activeOpacity={0.8}
      >
        <ImageBackground
          source={DEFAULT_CATEGORY_IMAGE}
          style={styles.groupImage}
          imageStyle={{ borderRadius: 12 }}
        >
          <View style={styles.overlay} />
          <View style={styles.groupIconContainer}>
            <Ionicons name="tv-outline" size={28} color="#edec25" />
          </View>
          <Text style={styles.groupText} numberOfLines={2}>
            {item}
          </Text>
          <View style={styles.channelCountBadge}>
            <Text style={styles.channelCountText}>{channelCount}</Text>
          </View>
        </ImageBackground>
      </TouchableOpacity>
    );
  }, [handleGroupSelect, getChannelCount]);

  const renderEmptyComponent = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Ionicons name="tv-outline" size={64} color="#555" />
      <Text style={styles.emptyText}>
        {searchQuery ? "Tidak ada channel yang ditemukan" : "Tidak ada channel dalam grup ini"}
      </Text>
      {searchQuery && (
        <TouchableOpacity 
          style={styles.clearSearchButton}
          onPress={() => setSearchQuery("")}
        >
          <Text style={styles.clearSearchText}>Hapus Pencarian</Text>
        </TouchableOpacity>
      )}
    </View>
  ), [searchQuery]);

  const { top } = useSafeAreaInsets();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <View style={styles.loadingContainer}>
          <LottieView
            source={require("../../assets/animations/loading.json")}
            autoPlay
            loop
            style={styles.lottie}
          />
          <Text style={styles.loadingText}>Memuat saluran TV...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#ff4444" />
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity
            style={styles.reloadButton}
            onPress={onRefresh}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={20} color="#fff" />
            <Text style={styles.reloadButtonText}>Muat Ulang</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedGroup) {
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim, paddingTop: top }]}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        
        <View style={styles.channelHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
            <Text style={styles.backText}>Kembali</Text>
          </TouchableOpacity>
          
          <Text style={styles.groupTitle} numberOfLines={1}>
            {selectedGroup}
          </Text>
          
          <View style={styles.headerRightPlaceholder} />
        </View>

        <FlatList
          ref={flatListRef}
          key={`channels-${selectedGroup}`}
          data={filteredChannels}
          numColumns={3}
          keyExtractor={(item, index) => `${item.url}-${index}`}
          contentContainerStyle={styles.channelList}
          renderItem={renderChannelItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={renderEmptyComponent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={15}
          windowSize={10}
          removeClippedSubviews={Platform.OS === 'android'}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, paddingTop: top }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      
      <View style={styles.header}>
        <Text style={styles.title}>📺 LIVE TV</Text>
        <Text style={styles.subtitle}>
          {sortedGroups.length} Kategori • {channels.length} Channel
        </Text>
      </View>

      <FlatList
        key="groupList"
        data={sortedGroups}
        numColumns={2}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.groupList}
        renderItem={renderGroupItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        windowSize={10}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background || "#0a0a0a",
    paddingHorizontal: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  reloadButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reloadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  header: {
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },
  subtitle: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  backText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  headerRightPlaceholder: {
    width: 60,
  },
  groupTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    flex: 1,
    textAlign: 'center',
  },
  groupList: {
    paddingBottom: 20,
  },
  groupCard: {
    flex: 1,
    margin: 6,
    borderRadius: 12,
    overflow: "hidden",
    height: 130,
    backgroundColor: "#1E293B",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  groupImage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 12,
  },
  groupIconContainer: {
    marginBottom: 8,
  },
  groupText: {
    color: "#edec25",
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    textTransform: "uppercase",
  },
  channelCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  channelCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  channelList: {
    justifyContent: "center",
    paddingBottom: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  clearSearchButton: {
    marginTop: 16,
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearSearchText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '500',
  },
  lottie: {
    width: 150,
    height: 150,
  },
});

export default LiveTV;