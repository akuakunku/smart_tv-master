import React, { useState, useCallback, useEffect } from "react";
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    StatusBar,
    RefreshControl,
    Modal,
    TextInput,
    Dimensions,
    Alert,
    ActivityIndicator,
    Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { watchHistoryEvent, userUpdateEmitter } from "../../utils/events";
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get("window");
const DEFAULT_AVATAR = require("../../assets/images/ic_launcher.png");

interface WatchHistoryItem {
    url: string;
    name: string;
    logo?: string;
    group?: string;
    timestamp: number;
    watchedAt: string;
}

interface User {
    username: string;
    bio: string;
    avatar: string;
}

const ProfileScreen = () => {
    const navigation = useNavigation<any>();
    const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [isEditModalVisible, setEditModalVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<User>({
        username: "Smart TV User",
        bio: "Streaming Enthusiast",
        avatar: "",
    });
    const [editedUser, setEditedUser] = useState<User>({ ...user });

    const numColumns = 3;
    const cardSize = (width - 48) / numColumns;

    const getImageSource = (uri: string | null | undefined) => {
        if (!uri || typeof uri !== 'string' || uri.trim() === '') {
            return DEFAULT_AVATAR;
        }
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
            return { uri: uri };
        }
        return DEFAULT_AVATAR;
    };

    const loadData = async () => {
        try {
            setIsLoading(true);
            const [storedUser, storedHistory] = await Promise.all([
                AsyncStorage.getItem("user"),
                AsyncStorage.getItem("watchHistory")
            ]);

            if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                setUser(parsedUser);
                setEditedUser(parsedUser);
            }

            if (storedHistory) {
                const parsed = JSON.parse(storedHistory);
                const sortedHistory = Array.isArray(parsed)
                    ? parsed.sort((a: WatchHistoryItem, b: WatchHistoryItem) => b.timestamp - a.timestamp)
                    : [];
                setWatchHistory(sortedHistory);
            }
        } catch (e) {
            console.error("Load Error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useFocusEffect(
        useCallback(() => {
            const handleUpdate = () => loadData();
            watchHistoryEvent.on("historyUpdated", handleUpdate);
            loadData();
            return () => {
                watchHistoryEvent.off("historyUpdated", handleUpdate);
            };
        }, [])
    );

    const handleSave = async () => {
        try {
            await AsyncStorage.setItem("user", JSON.stringify(editedUser));
            setUser(editedUser);
            setEditModalVisible(false);
            userUpdateEmitter.emit('userUpdate');
            Alert.alert("Berhasil", "Profil berhasil diperbarui");
        } catch (error) {
            console.error("Save error:", error);
            Alert.alert("Error", "Gagal menyimpan profil");
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const clearAllHistory = async () => {
        Alert.alert(
            "Hapus Riwayat",
            "Apakah Anda yakin ingin menghapus semua riwayat tontonan?",
            [
                { text: "Batal", style: "cancel" },
                {
                    text: "Hapus Semua",
                    style: "destructive",
                    onPress: async () => {
                        await AsyncStorage.setItem("watchHistory", JSON.stringify([]));
                        setWatchHistory([]);
                        watchHistoryEvent.emit('historyUpdated');
                        Alert.alert("Berhasil", "Riwayat tontonan telah dihapus");
                    }
                }
            ]
        );
    };

    const deleteHistoryItem = async (item: WatchHistoryItem) => {
        Alert.alert(
            "Hapus Item",
            `Hapus "${item.name}" dari riwayat?`,
            [
                { text: "Batal", style: "cancel" },
                {
                    text: "Hapus",
                    style: "destructive",
                    onPress: async () => {
                        const newHistory = watchHistory.filter(h => h.url !== item.url);
                        await AsyncStorage.setItem("watchHistory", JSON.stringify(newHistory));
                        setWatchHistory(newHistory);
                        watchHistoryEvent.emit('historyUpdated');
                    }
                }
            ]
        );
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return "Hari ini";
        if (days === 1) return "Kemarin";
        if (days < 7) return `${days} hari lalu`;
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    };

    const renderHistoryItem = ({ item }: { item: WatchHistoryItem }) => (
        <TouchableOpacity
            style={[styles.card, { width: cardSize, height: cardSize }]}
            onPress={() => navigation.navigate('PlayerScreen', { url: item.url, name: item.name })}
            activeOpacity={0.8}
            onLongPress={() => deleteHistoryItem(item)}
        >
            <Image source={getImageSource(item.logo)} style={styles.cardImage} defaultSource={DEFAULT_AVATAR} />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.cardGradient} />
            <View style={styles.cardContent}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.cardDate}>
                    <Ionicons name="time-outline" size={10} color="#e3c800" />
                    <Text style={styles.cardDateText}>{formatDate(item.timestamp)}</Text>
                </View>
            </View>
            <TouchableOpacity style={styles.cardDeleteBtn} onPress={() => deleteHistoryItem(item)}>
                <Ionicons name="close-circle" size={20} color="#ff6b6b" />
            </TouchableOpacity>
        </TouchableOpacity>
    );

    const renderEmptyHistory = () => (
        <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrapper}>
                <Ionicons name="tv-outline" size={64} color="#333" />
            </View>
            <Text style={styles.emptyTitle}>Belum Ada Riwayat</Text>
            <Text style={styles.emptySubtitle}>Channel yang Anda tonton akan muncul di sini</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate("LiveTvScreen")}>
                <Ionicons name="play-circle-outline" size={20} color="#000" />
                <Text style={styles.emptyButtonText}>Mulai Nonton</Text>
            </TouchableOpacity>
        </View>
    );

    const HeaderComponent = () => (
        <View style={styles.headerContainer}>
            <View style={styles.profileSection}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.openDrawer()}>
                    <Ionicons name="menu-outline" size={24} color="#fff" />
                </TouchableOpacity>

                <View style={styles.avatarContainer}>
                    <View style={styles.avatarWrapper}>
                        <Image source={getImageSource(user.avatar)} style={styles.avatar} />
                        <View style={styles.avatarBadge} />
                    </View>
                    <Text style={styles.userName}>{user.username || "Smart TV User"}</Text>
                    <Text style={styles.userBio}>{user.bio || "Streaming Enthusiast"}</Text>
                    <TouchableOpacity style={styles.editProfileBtn} onPress={() => { setEditedUser(user); setEditModalVisible(true); }}>
                        <Ionicons name="create-outline" size={16} color="#e3c800" />
                        <Text style={styles.editProfileText}>Edit Profil</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{watchHistory.length}</Text>
                        <Text style={styles.statLabel}>Tontonan</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{watchHistory.length > 0 ? new Set(watchHistory.map(h => h.group).filter(Boolean)).size : 0}</Text>
                        <Text style={styles.statLabel}>Kategori</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>30</Text>
                        <Text style={styles.statLabel}>Hari</Text>
                    </View>
                </View>
            </View>

            <View style={styles.historyHeader}>
                <View style={styles.historyTitleContainer}>
                    <Ionicons name="time-outline" size={20} color="#e3c800" />
                    <Text style={styles.historyTitle}>Riwayat Tontonan</Text>
                </View>
                {watchHistory.length > 0 && (
                    <TouchableOpacity onPress={clearAllHistory} style={styles.clearAllBtn}>
                        <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
                        <Text style={styles.clearAllText}>Hapus Semua</Text>
                    </TouchableOpacity>
                )}
            </View>
            {watchHistory.length > 0 && <Text style={styles.historySubtitle}>{watchHistory.length} channel • Terbaru di atas</Text>}
        </View>
    );

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <ActivityIndicator size="large" color="#e3c800" />
                <Text style={styles.loadingText}>Memuat profil...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000" translucent={false} />
            
            <FlatList
                data={watchHistory}
                keyExtractor={(item, index) => `${item.url}-${index}`}
                numColumns={numColumns}
                renderItem={renderHistoryItem}
                ListHeaderComponent={HeaderComponent}
                ListEmptyComponent={renderEmptyHistory}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e3c800" colors={["#e3c800"]} />}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={watchHistory.length > 0 ? styles.columnWrapper : undefined}
            />

            {/* Edit Profile Modal */}
            <Modal visible={isEditModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
                <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Edit Profil</Text>
                                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                                    <Ionicons name="close" size={24} color="#888" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.modalAvatarSection}>
                                <Image source={getImageSource(editedUser.avatar)} style={styles.modalAvatar} />
                                <Text style={styles.modalAvatarHint}>URL Avatar (opsional)</Text>
                            </View>

                            <TextInput 
                                style={styles.modalInput} 
                                value={editedUser.username} 
                                onChangeText={(t) => setEditedUser({ ...editedUser, username: t })} 
                                placeholder="Username" 
                                placeholderTextColor="#666" 
                            />
                            <TextInput 
                                style={[styles.modalInput, styles.modalTextArea]} 
                                value={editedUser.bio} 
                                onChangeText={(t) => setEditedUser({ ...editedUser, bio: t })} 
                                placeholder="Bio" 
                                placeholderTextColor="#666" 
                                multiline 
                                numberOfLines={3} 
                            />
                            <TextInput 
                                style={styles.modalInput} 
                                value={editedUser.avatar} 
                                onChangeText={(t) => setEditedUser({ ...editedUser, avatar: t })} 
                                placeholder="URL Avatar (https://...)" 
                                placeholderTextColor="#666" 
                                autoCapitalize="none" 
                            />

                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModalVisible(false)}>
                                    <Text style={styles.modalCancelText}>Batal</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave}>
                                    <Text style={styles.modalSaveText}>Simpan</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </BlurView>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0a' },
    listContent: { paddingBottom: 30 },
    columnWrapper: { justifyContent: 'flex-start', paddingHorizontal: 12, gap: 12 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
    loadingText: { color: '#666', marginTop: 12, fontSize: 14 },
    headerContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
    profileSection: { alignItems: 'center', marginBottom: 24 },
    backButton: { position: 'absolute', top: 0, left: 0, padding: 8, zIndex: 1 },
    avatarContainer: { alignItems: 'center', marginTop: 8 },
    avatarWrapper: { position: 'relative', marginBottom: 12 },
    avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#e3c800', backgroundColor: '#1a1a1a' },
    avatarBadge: { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#4ade80', borderWidth: 2, borderColor: '#0a0a0a' },
    userName: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
    userBio: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 12 },
    editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1a1a1a', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a2a2a' },
    editProfileText: { color: '#e3c800', fontSize: 13, fontWeight: '500' },
    statsContainer: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, marginTop: 20 },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: 'bold', color: '#e3c800' },
    statLabel: { fontSize: 11, color: '#666', marginTop: 4 },
    statDivider: { width: 1, backgroundColor: '#222', marginHorizontal: 8 },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 },
    historyTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    historyTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    clearAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255, 107, 107, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    clearAllText: { color: '#ff6b6b', fontSize: 12, fontWeight: '500' },
    historySubtitle: { fontSize: 12, color: '#555', marginBottom: 16 },
    card: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#111', position: 'relative' },
    cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
    cardContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8 },
    cardName: { color: '#fff', fontSize: 11, fontWeight: '600', marginBottom: 2 },
    cardDate: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardDateText: { color: '#e3c800', fontSize: 9, fontWeight: '500' },
    cardDeleteBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 2 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
    emptyIconWrapper: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
    emptySubtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 24 },
    emptyButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e3c800', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25 },
    emptyButtonText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '100%', maxWidth: 400, backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#2a2a2a' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
    modalAvatarSection: { alignItems: 'center', marginBottom: 20 },
    modalAvatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#2a2a2a', marginBottom: 8 },
    modalAvatarHint: { fontSize: 11, color: '#666', marginTop: 4 },
    modalInput: { backgroundColor: '#2a2a2a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, marginBottom: 12 },
    modalTextArea: { minHeight: 80, textAlignVertical: 'top' },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
    modalCancelBtn: { flex: 1, backgroundColor: '#2a2a2a', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    modalCancelText: { color: '#fff', fontWeight: '500' },
    modalSaveBtn: { flex: 1, backgroundColor: '#e3c800', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    modalSaveText: { color: '#000', fontWeight: 'bold' },
});

export default ProfileScreen;