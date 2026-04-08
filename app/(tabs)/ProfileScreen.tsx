import React, { useState, useCallback, useEffect } from "react";
import {
    View, Text, Image, TouchableOpacity, StyleSheet, FlatList,
    StatusBar, RefreshControl, Modal, TextInput, Dimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { watchHistoryEvent, userUpdateEmitter } from "../../utils/events";

const { width } = Dimensions.get("window");
const DEFAULT_AVATAR = "https://img.lovepik.com/png/20231108/cute-cartoon-water-drop-coloring-page-can-be-used-for_531960_wh860.png";

const ProfileScreen = () => {
    const navigation = useNavigation<any>();
    const [watchHistory, setWatchHistory] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [isEditModalVisible, setEditModalVisible] = useState(false);
    const [user, setUser] = useState({
        username: "Smart_TV User",
        bio: "Streaming Enthusiast",
        avatar: "",
    });
    const [editedUser, setEditedUser] = useState({ ...user });

    const getImageSource = (uri: string | null | undefined) => {
        if (!uri || typeof uri !== 'string' || uri.trim() === '') {
            return { uri: DEFAULT_AVATAR };
        }
        return { uri: uri };
    };

    const loadData = async () => {
        try {
            const [storedUser, storedHistory] = await Promise.all([
                AsyncStorage.getItem("user"),
                AsyncStorage.getItem("watchHistory")
            ]);
            
            if (storedUser) setUser(JSON.parse(storedUser));
            if (storedHistory) {
                const parsed = JSON.parse(storedHistory);
                setWatchHistory(Array.isArray(parsed) ? parsed : []);
            }
        } catch (e) {
            console.error("Load Error:", e);
        }
    };

    useEffect(() => { loadData(); }, []);

    // FIX: Menggunakan .on dan .off untuk menghindari error sub.remove
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
        await AsyncStorage.setItem("user", JSON.stringify(editedUser));
        setUser(editedUser);
        setEditModalVisible(false);
        userUpdateEmitter.emit('userUpdate');
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    return (
        <View style={styles.mainContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#000" translucent={false} />
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
                <FlatList
                    ListHeaderComponent={
                        <View style={styles.header}>
                            <TouchableOpacity style={styles.drawerBtn} onPress={() => navigation.openDrawer()}>
                                <Text style={styles.menuIcon}>☰</Text>
                            </TouchableOpacity>
                            <View style={styles.avatarCircle}>
                                <Image source={getImageSource(user.avatar)} style={styles.img} />
                            </View>
                            <Text style={styles.name}>{user.username || "User"}</Text>
                            <Text style={styles.bio}>{user.bio || "Streaming Enthusiast"}</Text>
                            <TouchableOpacity 
                                style={styles.editBtn} 
                                onPress={() => { setEditedUser(user); setEditModalVisible(true); }}
                            >
                                <Text style={styles.editBtnText}>Edit Profile</Text>
                            </TouchableOpacity>
                            <View style={styles.historyLabelContainer}>
                                <Text style={styles.historyLabel}>📺 Riwayat Tontonan</Text>
                            </View>
                        </View>
                    }
                    data={watchHistory}
                    numColumns={4}
                    keyExtractor={(_, i) => i.toString()}
                    renderItem={({ item }: any) => (
                        <TouchableOpacity 
                            style={styles.card} 
                            onPress={() => navigation.navigate('PlayerScreen', { url: item.url, logo: item.logo })}
                        >
                            <Image source={getImageSource(item.logo)} style={styles.thumb} />
                            <View style={styles.cardLabel}>
                                <Text style={styles.cardText} numberOfLines={1}>{item.name}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e3c800" />
                    }
                />
            </SafeAreaView>

            <Modal visible={isEditModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
                <View style={styles.modalBg}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Update Profil</Text>
                        <TextInput 
                            style={styles.input} 
                            value={editedUser.username} 
                            onChangeText={(t) => setEditedUser({...editedUser, username: t})} 
                            placeholder="Username" 
                            placeholderTextColor="#555"
                        />
                        <TextInput 
                            style={styles.input} 
                            value={editedUser.bio} 
                            onChangeText={(t) => setEditedUser({...editedUser, bio: t})} 
                            placeholder="Bio" 
                            placeholderTextColor="#555"
                        />
                        <View style={styles.btnRow}>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                                <Text style={styles.btnText}>Simpan</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.saveBtn, {backgroundColor: '#333'}]} 
                                onPress={() => setEditModalVisible(false)}
                            >
                                <Text style={styles.btnText}>Batal</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    mainContainer: { flex: 1, backgroundColor: "#000" },
    safeArea: { flex: 1 },
    header: { alignItems: 'center', padding: 20 },
    drawerBtn: { position: 'absolute', left: 20, top: 10, padding: 5 },
    menuIcon: { color: '#e3c800', fontSize: 28, fontWeight: 'bold' },
    avatarCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#e3c800', overflow: 'hidden', backgroundColor: '#111', marginTop: 10 },
    img: { width: '100%', height: '100%', resizeMode: 'cover' },
    name: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 12 },
    bio: { color: '#aaa', fontSize: 14, marginTop: 4, textAlign: 'center' },
    editBtn: { marginTop: 18, backgroundColor: '#222', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
    editBtnText: { color: '#fff', fontWeight: 'bold' },
    historyLabelContainer: { width: '100%', borderBottomWidth: 1, borderBottomColor: '#222', paddingBottom: 8, marginTop: 35, marginBottom: 10 },
    historyLabel: { color: '#e3c800', fontWeight: 'bold', fontSize: 16 },
    card: { width: (width / 4) - 10, margin: 5, backgroundColor: '#111', borderRadius: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: '#222' },
    thumb: { width: '100%', aspectRatio: 1, resizeMode: 'contain' },
    cardLabel: { backgroundColor: '#e3c800', paddingVertical: 4 },
    cardText: { color: '#000', fontSize: 10, textAlign: 'center', fontWeight: 'bold' },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '85%', backgroundColor: '#1e1e1e', padding: 25, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    input: { backgroundColor: '#2a2a2a', color: '#fff', padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 16 },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    saveBtn: { flex: 1, backgroundColor: '#e3c800', padding: 12, borderRadius: 10, alignItems: 'center' },
    btnText: { fontWeight: 'bold', color: '#000' }
});

export default ProfileScreen;