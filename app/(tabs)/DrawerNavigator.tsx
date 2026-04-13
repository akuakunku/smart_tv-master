import React, { useState, useCallback, useEffect, Suspense, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  SafeAreaView,
  BackHandler,
  ActivityIndicator,
  Platform,
  FlatList,
  Alert,
  StatusBar,
} from 'react-native';
import { createDrawerNavigator } from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EventEmitter } from 'events';

import Colors from "../../constants/Colors";
import { FavoriteProvider } from "../../contexts/FavoriteContext";

// Screens
import HomeScreen from "./HomeScreen";
import VodScreen from "./VodScreen";
import LiveTvScreen from "./LiveTvScreen";
import PlayerScreen from "./PlayerScreen";
import FavoriteScreen from "./FavoriteScreen";

// Lazy loaded screens
const ProfileScreen = React.lazy(() => import('./ProfileScreen'));
const EditUrl = React.lazy(() => import('./EditUrl'));
const SearchScreen = React.lazy(() => import('./SearchScreen'));

export const userUpdateEmitter = new EventEmitter();

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();

interface User {
  username: string;
  avatar?: string | null;
}

interface CustomDrawerContentProps {
  state: any;
  navigation: any;
  descriptors: any;
}

const LoadingFallback = () => (
  <SafeAreaView style={styles.loadingFallback}>
    <StatusBar backgroundColor="#000" barStyle="light-content" />
    <ActivityIndicator size="large" color={Colors.primary} />
    <Text style={styles.loadingText}>Memuat Aplikasi...</Text>
  </SafeAreaView>
);

const TabBarIcon = ({ name, color, size }: { name: keyof typeof Ionicons.glyphMap; color: string; size: number }) => (
  <Ionicons name={name} size={size} color={color} />
);

/**
 * Tab Navigator (Bottom Bar)
 */
function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: "#888",
        tabBarStyle: {
          backgroundColor: "#0a0a0a",
          borderTopWidth: 1,
          borderTopColor: "#222",
          height: Platform.OS === 'ios' ? 90 : 70,
          paddingBottom: Platform.OS === 'ios' ? 25 : 12,
          paddingTop: 8,
        },
        tabBarHideOnKeyboard: true,
      })}
    >
      <Tab.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: (p) => <TabBarIcon name="home" {...p} />
        }}
      />
      <Tab.Screen
        name="LiveTvScreen"
        component={LiveTvScreen}
        options={{
          tabBarLabel: 'Live',
          tabBarIcon: (p) => <TabBarIcon name="tv" {...p} />
        }}
      />
      <Tab.Screen
        name="VodScreen"
        component={VodScreen}
        options={{
          tabBarLabel: 'VOD',
          tabBarIcon: (p) => <TabBarIcon name="videocam" {...p} />
        }}
      />
      <Tab.Screen
        name="PlayerScreen"
        component={PlayerScreen}
        options={{
          tabBarLabel: 'Player',
          tabBarIcon: (p) => <TabBarIcon name="play-circle" {...p} />
        }}
      />
      <Tab.Screen
        name="ProfileScreen"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: (p) => <TabBarIcon name="person" {...p} />
        }}
      />
    </Tab.Navigator>
  );
}

const CustomDrawerContent = React.memo(({ state, navigation, descriptors }: CustomDrawerContentProps) => {
  const [user, setUser] = useState<User>({ username: 'Smart TV User', avatar: null });
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(prev => ({ ...prev, ...parsedUser }));
          setAvatarError(false);
        }
      } catch (error) {
        console.error('Gagal memuat user:', error);
      }
    };

    loadUser();
    const handleUserUpdate = () => loadUser();
    userUpdateEmitter.on('userUpdate', handleUserUpdate);

    return () => {
      userUpdateEmitter.off('userUpdate', handleUserUpdate);
    };
  }, []);

  const handleExitApp = useCallback(() => {
    Alert.alert(
      'Keluar',
      'Apakah Anda yakin ingin keluar?',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Keluar', onPress: () => BackHandler.exitApp() }
      ],
      { cancelable: true }
    );
  }, []);

  const avatarSource = useMemo(() => {
    const defaultImg = require("../../assets/images/ic_launcher.png");
    if (avatarError || !user.avatar) return defaultImg;
    if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) {
      return { uri: user.avatar };
    }
    return defaultImg;
  }, [user.avatar, avatarError]);

  // PERBAIKAN: Filter drawer items yang valid
  const drawerItems = useMemo(() => {
    const validRoutes = ['Home', 'FavoriteScreen', 'SearchScreen', 'EditUrl'];

    return state.routes
      .filter((route: any) => validRoutes.includes(route.name))
      .map((route: any) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === state.routes.findIndex((r: any) => r.key === route.key);

        let iconName = 'ellipse-outline';
        let displayName = options.title || route.name;

        switch (route.name) {
          case 'Home':
            iconName = 'home-outline';
            displayName = 'Beranda';
            break;
          case 'FavoriteScreen':
            iconName = 'heart-outline';
            displayName = 'Favorit';
            break;
          case 'SearchScreen':
            iconName = 'search-outline';
            displayName = 'Cari Channel';
            break;
          case 'EditUrl':
            iconName = 'link-outline';
            displayName = 'Kelola M3U';
            break;
        }

        return {
          key: route.key,
          name: route.name,
          title: displayName,
          icon: iconName,
          focused: isFocused,
        };
      });
  }, [state.routes, state.index, descriptors]);

  const handleNavigation = useCallback((itemName: string) => {
    navigation.closeDrawer();
    navigation.navigate(itemName);
  }, [navigation]);

  const renderDrawerItem = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.drawerItem, item.focused && styles.drawerItemActive]}
      onPress={() => handleNavigation(item.name)}
    >
      <View style={[styles.iconContainer, item.focused && styles.iconContainerActive]}>
        <Ionicons name={item.icon as any} size={22} color={item.focused ? "#fff" : "#666"} />
      </View>
      <Text style={[styles.drawerItemText, item.focused && styles.drawerItemTextActive]}>
        {item.title}
      </Text>
      {item.focused && <View style={styles.activeDot} />}
    </TouchableOpacity>
  ), [handleNavigation]);

  const keyExtractor = useCallback((item: any) => item.key, []);

  return (
    <SafeAreaView style={styles.drawerContainer}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* Header */}
      <View style={styles.drawerHeader}>
        <View style={styles.avatarWrapper}>
          <Image
            source={avatarSource}
            style={styles.drawerAvatar}
            onError={() => setAvatarError(true)}
          />
          <View style={styles.statusIndicator} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.welcomeText}>Selamat Datang,</Text>
          <Text style={styles.username} numberOfLines={1}>
            {user.username || 'Smart TV User'}
          </Text>
        </View>
      </View>

      <FlatList
        data={drawerItems}
        keyExtractor={keyExtractor}
        renderItem={renderDrawerItem}
        contentContainerStyle={styles.drawerMenuContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.drawerFooter}>
        <TouchableOpacity
          style={styles.exitButton}
          onPress={handleExitApp}
          activeOpacity={0.7}
        >
          <Ionicons name="power-outline" size={20} color="#ff6b6b" />
          <Text style={styles.exitText}>Keluar Aplikasi</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>v2.0.0 • Chesko TV Player</Text>
      </View>
    </SafeAreaView>
  );
});

CustomDrawerContent.displayName = 'CustomDrawerContent';

/**
 * Drawer Navigator
 */
function DrawerNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#000',
          width: 300,
        },
        drawerType: 'slide',
        overlayColor: 'rgba(0,0,0,0.8)',
        swipeEnabled: true,
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeTabs}
        options={{
          title: 'Beranda',
          drawerIcon: (p) => <Ionicons name="home-outline" {...p} />
        }}
      />
      <Drawer.Screen
        name="PlayerScreen"
        component={PlayerScreen}
        options={{
          drawerItemStyle: { display: 'none' },
          swipeEnabled: false,
        }}
      />
      <Drawer.Screen
        name="FavoriteScreen"
        component={FavoriteScreen}
        options={{
          title: 'Favorit Saya',
          drawerIcon: (p) => <Ionicons name="heart-outline" {...p} />
        }}
      />
      <Drawer.Screen
        name="SearchScreen"
        component={SearchScreen}
        options={{
          title: 'Cari Channel',
          drawerIcon: (p) => <Ionicons name="search-outline" {...p} />
        }}
      />
      <Drawer.Screen
        name="EditUrl"
        component={EditUrl}
        options={{
          title: 'Kelola M3U URL',
          drawerIcon: (p) => <Ionicons name="link-outline" {...p} />
        }}
      />
     
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  drawerHeader: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 40,
    padding: 3,
  },
  drawerAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#111'
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4ade80',
    borderWidth: 2,
    borderColor: '#000'
  },
  userInfo: {
    marginLeft: 15,
    flex: 1
  },
  welcomeText: {
    color: '#666',
    fontSize: 12,
    marginBottom: 2
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff'
  },
  drawerMenuContent: {
    paddingVertical: 20,
    paddingHorizontal: 15
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 15,
    marginVertical: 4,
  },
  drawerItemActive: {
    backgroundColor: '#1a1a1a',
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  iconContainerActive: {
    backgroundColor: Colors.primary,
  },
  drawerItemText: {
    fontSize: 15,
    color: '#888',
    flex: 1,
  },
  drawerItemTextActive: {
    color: '#fff',
    fontWeight: 'bold'
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.primary,
    marginLeft: 'auto'
  },
  drawerFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    marginTop: 'auto',
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderRadius: 12,
    justifyContent: 'center',
    gap: 8,
  },
  exitText: {
    color: '#ff6b6b',
    fontWeight: 'bold'
  },
  versionText: {
    textAlign: 'center',
    color: '#333',
    fontSize: 10,
    marginTop: 15
  },
  loadingFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000'
  },
  loadingText: {
    marginTop: 10,
    color: '#fff'
  },
});

export default function DrawerNavigatorWrapper() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <FavoriteProvider>
        <DrawerNavigator />
      </FavoriteProvider>
    </Suspense>
  );
}