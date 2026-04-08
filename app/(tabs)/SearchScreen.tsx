import React, { useState, useMemo, useCallback } from "react";
import {
    View, Text, TextInput, FlatList, TouchableOpacity,
    Image, StyleSheet, ActivityIndicator, SafeAreaView, RefreshControl, Alert,
    StatusBar, Dimensions
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import useM3uParse from "../../hooks/M3uParse";
import Toast from 'react-native-toast-message';
import Icon from 'react-native-vector-icons/Ionicons';

const { width } = Dimensions.get("window");
const CARD_WIDTH = width / 2 - 24; 

const defaultLogo = require("../../assets/images/maskable.png");

const SearchScreen = () => {
    const { channels, loading, error, refetch } = useM3uParse();
    const [searchQuery, setSearchQuery] = useState("");
    const [searchPressed, setSearchPressed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [searchError, setSearchError] = useState("");
    const navigation = useNavigation<any>();

    const allChannels = useMemo(() => channels || [], [channels]);

    const filteredChannels = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        
        return allChannels.filter(channel =>
            channel.name?.toLowerCase().includes(query)
        );
    }, [allChannels, searchQuery]);

    const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
        Toast.show({
            type,
            text1: message,
            position: 'bottom',
            visibilityTime: 2000,
        });
    }, []);

    const handleSearchChange = (text: string) => {
        setSearchQuery(text);
        setSearchPressed(text.trim().length > 0);
        if (searchError) setSearchError("");
    };

    const handleClearSearch = useCallback(() => {
        setSearchQuery("");
        setSearchPressed(false);
        setSearchError("");
    }, []);

    const handleChannelPress = useCallback((item: any) => {
        if (item.url) {
            navigation.navigate("Home", { 
                screen: "PlayerScreen", 
                params: { url: item.url, name: item.name } 
            });
        } else {
            Alert.alert("Oops!", "Tautan channel ini tidak tersedia.");
        }
    }, [navigation]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await refetch();
            showToast("Data diperbarui!", 'success');
        } catch (err) {
            showToast("Gagal memuat ulang data");
        } finally {
            setRefreshing(false);
        }
    }, [refetch, showToast]);

    const renderChannelItem = useCallback(({ item }: any) => (
        <TouchableOpacity
            style={styles.channelCard}
            onPress={() => handleChannelPress(item)}
            activeOpacity={0.8}
        >
            <View style={styles.logoWrapper}>
                <Image
                    source={item.logo ? { uri: item.logo } : defaultLogo}
                    style={styles.logoImage}
                    resizeMode="contain"
                />
            </View>
            <View style={styles.channelInfo}>
                <Text style={styles.channelNameText} numberOfLines={2}>
                    {item.name}
                </Text>
                {!!item.group && (
                    <Text style={styles.groupNameText} numberOfLines={1}>
                        {item.group}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    ), [handleChannelPress]);

    // Helper untuk merender konten utama agar tidak ada string liar
    const renderContent = () => {
        if (loading) {
            return (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#007bff" />
                    <Text style={styles.statusText}>Memproses data channel...</Text>
                </View>
            );
        }

        if (error) {
            return (
                <View style={styles.centerContainer}>
                    <Icon name="cloud-offline-outline" size={60} color="#444" />
                    <Text style={styles.errorText}>Gagal terhubung ke server</Text>
                    <TouchableOpacity onPress={onRefresh} style={styles.retryBtn}>
                        <Text style={styles.retryBtnText}>Coba Lagi</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (!searchPressed) {
            return (
                <View style={styles.centerContainer}>
                    <Icon name="tv-outline" size={80} color="#1a1a1a" />
                    <Text style={styles.hintText}>Masukkan kata kunci untuk mencari channel favorit Anda</Text>
                </View>
            );
        }

        if (filteredChannels.length === 0) {
            return (
                <View style={styles.centerContainer}>
                    <Icon name="search-outline" size={60} color="#333" />
                    <Text style={styles.noResultsText}>
                        Tidak ditemukan hasil untuk "{searchQuery}"
                    </Text>
                </View>
            );
        }

        return (
            <FlatList
                data={filteredChannels}
                keyExtractor={(item, index) => item.url + index}
                renderItem={renderChannelItem}
                numColumns={2}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007bff" />
                }
                ListHeaderComponent={
                    <Text style={styles.resultCountText}>
                        Ditemukan {filteredChannels.length} channel
                    </Text>
                }
            />
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor="#050505" translucent={false} />
            <View style={styles.mainContainer}>
                <View style={styles.headerRow}>
                    <TouchableOpacity 
                        onPress={() => navigation.goBack()} 
                        style={styles.headerIconButton}
                    >
                        <Icon name="chevron-back" size={28} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Pencarian</Text>
                    <View style={{ width: 45 }} />
                </View>

                <View style={styles.searchBarWrapper}>
                    <View style={styles.searchInnerContainer}>
                        <Icon name="search-outline" size={20} color="#888" style={styles.searchIcon} />
                        <TextInput
                            style={styles.textInput}
                            placeholder="Cari nama channel TV..."
                            placeholderTextColor="#666"
                            value={searchQuery}
                            onChangeText={handleSearchChange}
                            returnKeyType="search"
                            autoFocus={true}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={handleClearSearch} style={styles.clearIconWrapper}>
                                <Icon name="close-circle" size={20} color="#666" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {renderContent()}
            </View>
            <Toast />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#050505",
    },
    mainContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginVertical: 12,
    },
    headerIconButton: {
        width: 45,
        height: 45,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 12,
        backgroundColor: "#151515",
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 0.5,
    },
    searchBarWrapper: {
        marginBottom: 16,
    },
    searchInnerContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1A1A1A",
        borderRadius: 15,
        paddingHorizontal: 12,
        height: 54,
        borderWidth: 1,
        borderColor: "#222",
    },
    searchIcon: {
        marginRight: 10,
    },
    textInput: {
        flex: 1,
        color: "#fff",
        fontSize: 16,
        fontWeight: "500",
    },
    clearIconWrapper: {
        padding: 4,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    statusText: {
        color: '#888',
        marginTop: 12,
        fontSize: 14,
    },
    hintText: {
        color: '#444',
        textAlign: 'center',
        marginTop: 16,
        fontSize: 15,
        lineHeight: 22,
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 16,
        marginTop: 10,
        marginBottom: 20,
    },
    retryBtn: {
        backgroundColor: "#007bff",
        paddingHorizontal: 25,
        paddingVertical: 10,
        borderRadius: 10,
    },
    retryBtnText: {
        color: "#fff",
        fontWeight: "700",
    },
    listContent: {
        paddingBottom: 30,
    },
    gridRow: {
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    channelCard: {
        width: CARD_WIDTH,
        backgroundColor: "#111",
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#222",
    },
    logoWrapper: {
        width: '100%',
        height: 100,
        backgroundColor: "#1A1A1A",
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    channelInfo: {
        padding: 12,
        alignItems: 'center',
    },
    channelNameText: {
        fontSize: 14,
        fontWeight: "700",
        color: "#fff",
        textAlign: "center",
        marginBottom: 4,
    },
    groupNameText: {
        fontSize: 11,
        color: "#007bff",
        fontWeight: "600",
        textTransform: 'uppercase',
    },
    resultCountText: {
        color: '#666',
        fontSize: 13,
        marginBottom: 15,
        marginLeft: 4,
    },
    noResultsText: {
        color: "#666",
        fontSize: 16,
        textAlign: "center",
        marginTop: 12,
    },
});

export default SearchScreen;