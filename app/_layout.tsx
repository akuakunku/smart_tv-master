import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { 
    View, Text, StyleSheet, Platform, Animated, 
    Dimensions, Easing, StatusBar as RNStatusBar,
    useWindowDimensions
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as NavigationBar from "expo-navigation-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import LottieView from "lottie-react-native";
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// IMPORT PROVIDERS
import { FavoriteProvider } from "../contexts/FavoriteContext";
import { EPGProvider } from "../contexts/EPGContext";
import DrawerNavigator from "./(tabs)/DrawerNavigator";
import loadingAnimation from "../assets/animations/loading.json";

// Responsive Network Banner Component
const NetworkBanner = ({ isOnline, showBackOnline, networkType, fadeAnim, slideAnim }: any) => {
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const isTablet = windowWidth >= 768;
    
    const getStatusConfig = () => {
        if (!isOnline) return { color: "#FF3B30", icon: "cloud-offline", msg: "Koneksi Terputus" };
        if (showBackOnline) return { color: "#34C759", icon: "checkmark-circle", msg: "Kembali Online" };
        return { color: "#007AFF", icon: "cellular", msg: `Tersambung via ${networkType || 'Jaringan'}` };
    };
    const config = getStatusConfig();

    return (
        <Animated.View style={[
            styles.banner,
            { 
                backgroundColor: config.color,
                paddingTop: Platform.OS === 'ios' ? insets.top : (RNStatusBar.currentHeight || 0) + 5,
                transform: [{ translateY: slideAnim }],
                opacity: fadeAnim 
            }
        ]}>
            <View style={[styles.bannerContent, isTablet && styles.tabletBannerContent]}>
                <Ionicons name={config.icon as any} size={isTablet ? 20 : 16} color="white" />
                <Text style={[styles.bannerText, isTablet && styles.tabletBannerText]}>{config.msg}</Text>
            </View>
        </Animated.View>
    );
};

export default function Layout() {
    const [isOnline, setIsOnline] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [showBackOnline, setShowBackOnline] = useState(false);
    const [networkType, setNetworkType] = useState<string | null>(null);
    const [loadingProgress, setLoadingProgress] = useState(0);
    
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(-100)).current;
    const progressWidth = useRef(new Animated.Value(0)).current;
    const contentFade = useRef(new Animated.Value(0)).current;

    // Responsive values
    const isTablet = windowWidth >= 768;
    const isLandscape = windowWidth > windowHeight;
    const lottieSize = isTablet ? windowWidth * 0.4 : windowWidth * 0.6;
    const progressBarWidth = isTablet ? windowWidth * 0.3 : windowWidth * 0.4;
    const brandFontSize = isTablet ? 48 : 32;
    const taglineFontSize = isTablet ? 12 : 10;
    const percentFontSize = isTablet ? 12 : 10;

    // Simulasi Loading yang lebih halus
    const simulateLoading = useCallback(async () => {
        const steps = [0.25, 0.55, 0.85, 1.0];
        for (const p of steps) {
            await new Promise(res => setTimeout(res, 400));
            setLoadingProgress(p);
            Animated.timing(progressWidth, {
                toValue: p,
                duration: 400,
                easing: Easing.bezier(0.4, 0, 0.2, 1),
                useNativeDriver: false,
            }).start();
        }
        setTimeout(() => {
            setIsLoading(false);
            Animated.timing(contentFade, { toValue: 1, duration: 800, useNativeDriver: true }).start();
        }, 300);
    }, []);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            const isReachable = !!(state.isInternetReachable ?? state.isConnected);
            setNetworkType(state.type === 'wifi' ? 'WiFi' : state.type === 'cellular' ? 'Seluler' : null);
            
            if (!isOnline && isReachable) {
                setShowBackOnline(true);
                animateBanner(1, 0);
                setTimeout(() => animateBanner(0, -100, () => setShowBackOnline(false)), 3000);
            } else if (!isReachable) {
                animateBanner(1, 0);
            }
            setIsOnline(isReachable);
        });

        simulateLoading();
        setupHardware();
        return () => unsubscribe();
    }, [isOnline]);

    const animateBanner = (toOpacity: number, toSlide: number, callback?: () => void) => {
        Animated.parallel([
            Animated.spring(slideAnim, { toValue: toSlide, useNativeDriver: true, bounciness: 4 }),
            Animated.timing(fadeAnim, { toValue: toOpacity, duration: 300, useNativeDriver: true })
        ]).start(callback);
    };

    const setupHardware = async () => {
        try {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            if (Platform.OS === "android") {
                await NavigationBar.setVisibilityAsync("hidden");
                await NavigationBar.setBehaviorAsync("overlay-swipe");
            }
        } catch (e) {
            console.log("Hardware setup failed:", e);
        }
    };

    return (
        <SafeAreaProvider>
            <EPGProvider>
                <FavoriteProvider>
                    <View style={styles.container}>
                        <StatusBar style="light" translucent backgroundColor="transparent" />
                        
                        {isLoading ? (
                            <View style={styles.loadingWrapper}>
                                <LottieView 
                                    source={loadingAnimation} 
                                    autoPlay 
                                    loop 
                                    style={[styles.lottie, { width: lottieSize, height: lottieSize }]} 
                                />
                                <View style={[styles.brandContainer, isTablet && styles.tabletBrandContainer]}>
                                    <Text style={[styles.brandName, { fontSize: brandFontSize }]}>
                                        CHESKO <Text style={styles.brandTv}>TV</Text>
                                    </Text>
                                    <Text style={[styles.tagline, { fontSize: taglineFontSize }, isTablet && styles.tabletTagline]}>
                                        Premium Streaming Experience
                                    </Text>
                                </View>
                                <View style={[styles.progressContainer, isTablet && styles.tabletProgressContainer]}>
                                    <View style={[styles.track, { width: progressBarWidth }]}>
                                        <Animated.View style={[styles.bar, {
                                            width: progressWidth.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['0%', '100%']
                                            })
                                        }]} />
                                    </View>
                                    <Text style={[styles.percentText, { fontSize: percentFontSize }, isTablet && styles.tabletPercentText]}>
                                        {Math.round(loadingProgress * 100)}%
                                    </Text>
                                </View>
                                
                                {/* Loading Tips for better UX */}
                                <View style={[styles.loadingTips, isTablet && styles.tabletLoadingTips]}>
                                    <Text style={[styles.tipText, isTablet && styles.tabletTipText]}>
                                        {loadingProgress < 0.5 ? "Memuat konten terbaik..." : 
                                         loadingProgress < 0.8 ? "Menyiapkan streaming..." : 
                                         "Hampir selesai..."}
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <Animated.View style={{ flex: 1, opacity: contentFade }}>
                                <NetworkBanner 
                                    isOnline={isOnline} 
                                    showBackOnline={showBackOnline} 
                                    networkType={networkType}
                                    fadeAnim={fadeAnim}
                                    slideAnim={slideAnim}
                                />
                                <DrawerNavigator />
                            </Animated.View>
                        )}
                    </View>
                </FavoriteProvider>
            </EPGProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: "#000" 
    },
    loadingWrapper: { 
        flex: 1, 
        justifyContent: "center", 
        alignItems: "center", 
        backgroundColor: "#000" 
    },
    lottie: { 
        // Size will be dynamic
    },
    brandContainer: { 
        alignItems: 'center', 
        marginTop: -10 
    },
    tabletBrandContainer: {
        marginTop: -20,
    },
    brandName: { 
        color: '#FFF', 
        fontWeight: '900', 
        letterSpacing: 6 
    },
    brandTv: { 
        color: '#edec25' 
    },
    tagline: { 
        color: "#555", 
        fontWeight: "700", 
        textTransform: 'uppercase', 
        letterSpacing: 2, 
        marginTop: 5 
    },
    tabletTagline: {
        letterSpacing: 3,
        marginTop: 8,
    },
    progressContainer: { 
        marginTop: 50, 
        alignItems: 'center' 
    },
    tabletProgressContainer: {
        marginTop: 60,
    },
    track: { 
        height: 3, 
        backgroundColor: "#1A1A1A", 
        borderRadius: 10, 
        overflow: "hidden" 
    },
    bar: { 
        height: "100%", 
        backgroundColor: "#edec25" 
    },
    percentText: { 
        color: '#444', 
        fontWeight: 'bold', 
        marginTop: 8 
    },
    tabletPercentText: {
        marginTop: 10,
    },
    loadingTips: {
        position: 'absolute',
        bottom: 40,
        alignItems: 'center',
    },
    tabletLoadingTips: {
        bottom: 60,
    },
    tipText: {
        color: '#666',
        fontSize: 12,
        fontWeight: '500',
    },
    tabletTipText: {
        fontSize: 14,
    },
    banner: { 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        zIndex: 9999 
    },
    bannerContent: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center', 
        paddingBottom: 10, 
        gap: 6 
    },
    tabletBannerContent: {
        paddingBottom: 12,
        gap: 8,
    },
    bannerText: { 
        color: "white", 
        fontWeight: "700" 
    },
    tabletBannerText: {
        fontSize: 14,
    },
});