import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    View,
    Text,
    TextInput,
    FlatList,
    StyleSheet,
    Switch,
    ActivityIndicator,
    TouchableOpacity,
    Animated,
    StatusBar,
    RefreshControl,
    Keyboard,
    TouchableWithoutFeedback,
} from "react-native";
import Modal from "react-native-modal";
import Icon from "react-native-vector-icons/FontAwesome";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useM3uParse from "../../hooks/M3uParse";
import axios from 'axios';
import Toast from "react-native-toast-message";

const ACTIVE_URL_KEY = "active_m3u_url";

const EditUrl = () => {
    const {
        userUrls = [],
        addUrl: useM3uAddUrl,
        deleteUrl: useM3uDeleteUrl,
        defaultUrls = [],
        refetch,
        isFetching, // Menggunakan isFetching dari hook
        changeActiveUrl,
    } = useM3uParse();

    const [newUrl, setNewUrl] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [activeUrl, setActiveUrl] = useState("");
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
    
    const insets = useSafeAreaInsets();
    const [fadeAnim] = useState(new Animated.Value(0));
    const navigation = useNavigation();

    // Inisialisasi data
    useEffect(() => {
        const syncActiveUrl = async () => {
            const storedActive = await AsyncStorage.getItem(ACTIVE_URL_KEY);
            if (storedActive) {
                setActiveUrl(storedActive);
            } else if (defaultUrls.length > 0) {
                setActiveUrl(defaultUrls[0].url);
            }
        };
        syncActiveUrl();
        
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, [defaultUrls]);

    const handleAddUrl = useCallback(async () => {
        const trimmedUrl = newUrl.trim();
        if (!trimmedUrl.startsWith('http')) {
            Toast.show({ type: 'error', text1: 'URL Tidak Valid', text2: 'Harus dimulai dengan http/https' });
            return;
        }

        setIsProcessing(true);
        setIsValidating(true);
        Keyboard.dismiss();

        try {
            // Validasi file m3u
            const response = await axios.get(trimmedUrl, { timeout: 10000 });
            if (response.data.includes("#EXTM3U")) {
                const success = await useM3uAddUrl(trimmedUrl);
                if (success) {
                    setNewUrl("");
                    Toast.show({ type: 'success', text1: 'Berhasil', text2: 'Playlist ditambahkan' });
                    // Otomatis aktifkan jika ini URL pertama
                    if (userUrls.length === 0) handleToggleUrl(trimmedUrl);
                }
            } else {
                Toast.show({ type: 'error', text1: 'Format Salah', text2: 'File bukan playlist M3U valid' });
            }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Gagal', text2: 'Tidak dapat menjangkau URL' });
        } finally {
            setIsProcessing(false);
            setIsValidating(false);
        }
    }, [newUrl, useM3uAddUrl, userUrls]);

    const handleToggleUrl = useCallback(async (url: string) => {
        if (url === activeUrl || isProcessing) return;
        setIsProcessing(true);
        try {
            setActiveUrl(url); 
            await changeActiveUrl(url); // Memicu refetch otomatis di hook
            Toast.show({ type: 'success', text1: 'Playlist Aktif', text2: 'Saluran diperbarui' });
        } finally {
            setIsProcessing(false);
        }
    }, [activeUrl, isProcessing, changeActiveUrl]);

    const confirmDelete = async () => {
        if (!selectedUrl) return;
        try {
            await useM3uDeleteUrl(selectedUrl);
            if (activeUrl === selectedUrl) {
                const fallback = defaultUrls[0]?.url || "";
                setActiveUrl(fallback);
                await changeActiveUrl(fallback);
            }
            setModalVisible(false);
            Toast.show({ type: 'success', text1: 'Terhapus' });
        } finally {
            setSelectedUrl(null);
        }
    };

    const combinedUrls = useMemo(() => {
        const defaults = defaultUrls.map((item: any) => ({
            url: item.url,
            name: item.name,
            enabled: item.url === activeUrl,
            isUser: false,
        }));
        const users = userUrls.map((url: string) => ({
            url,
            name: "Custom Playlist",
            enabled: url === activeUrl,
            isUser: true,
        }));
        return [...defaults, ...users];
    }, [defaultUrls, userUrls, activeUrl]);

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
                    <StatusBar barStyle="light-content" backgroundColor="#0b0b0b" />
                    
                    {/* Header dengan Tombol Reload */}
                    <View style={styles.header}>
                        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
                            <Icon name="chevron-left" size={16} color="#fff" />
                        </TouchableOpacity>
                        
                        <Text style={styles.title}>Daftar Playlist</Text>

                        <TouchableOpacity 
                            style={[styles.headerBtn, isFetching && styles.btnDisabled]} 
                            onPress={refetch}
                            disabled={isFetching}
                        >
                            {isFetching ? (
                                <ActivityIndicator size="small" color="#4CAF50" />
                            ) : (
                                <Icon name="refresh" size={16} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Input Section */}
                    <View style={styles.inputSection}>
                        <View style={styles.inputWrapper}>
                            <Icon name="link" size={14} color="#555" style={{marginRight: 10}} />
                            <TextInput
                                style={styles.input}
                                placeholder="http://server.com/list.m3u"
                                placeholderTextColor="#444"
                                value={newUrl}
                                onChangeText={setNewUrl}
                                autoCapitalize="none"
                            />
                        </View>
                        <TouchableOpacity
                            style={[styles.addButton, (!newUrl || isProcessing) && styles.btnDisabled]}
                            onPress={handleAddUrl}
                            disabled={!newUrl || isProcessing}
                        >
                            {isValidating ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="plus" size={16} color="#fff" />}
                        </TouchableOpacity>
                    </View>

                    {/* List dengan Pull-to-Refresh */}
                    <FlatList
                        data={combinedUrls}
                        keyExtractor={(item) => item.url}
                        contentContainerStyle={styles.list}
                        refreshControl={
                            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#4CAF50" />
                        }
                        renderItem={({ item }) => (
                            <View style={[styles.card, item.enabled && styles.activeCard]}>
                                <View style={styles.cardInfo}>
                                    <View style={styles.cardHeader}>
                                        <Icon name={item.isUser ? "user-circle" : "shield"} size={10} color={item.enabled ? "#4CAF50" : "#666"} />
                                        <Text style={[styles.urlLabel, item.enabled && {color: '#4CAF50'}]}>{item.name}</Text>
                                    </View>
                                    <Text style={styles.urlText} numberOfLines={1}>{item.url}</Text>
                                </View>
                                
                                <View style={styles.cardActions}>
                                    <Switch
                                        value={item.enabled}
                                        onValueChange={() => handleToggleUrl(item.url)}
                                        trackColor={{ false: "#222", true: "#1a3a1a" }}
                                        thumbColor={item.enabled ? "#4CAF50" : "#444"}
                                    />
                                    {item.isUser && (
                                        <TouchableOpacity 
                                            style={styles.deleteBtn} 
                                            onPress={() => { setSelectedUrl(item.url); setModalVisible(true); }}
                                        >
                                            <Icon name="trash" size={16} color="#FF5733" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        )}
                    />
                </Animated.View>

                {/* Modal Konfirmasi Hapus */}
                <Modal isVisible={modalVisible} onBackdropPress={() => setModalVisible(false)}>
                    <View style={styles.modal}>
                        <Text style={styles.modalTitle}>Hapus URL?</Text>
                        <Text style={styles.modalBody}>Playlist ini akan dihapus dari daftar Anda.</Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}>
                                <Text style={{color: '#fff'}}>Batal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirm} onPress={confirmDelete}>
                                <Text style={{color: '#fff', fontWeight: 'bold'}}>Hapus</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </View>
        </TouchableWithoutFeedback>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0b0b0b' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#161616', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
    title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    inputSection: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 15, gap: 10 },
    inputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#161616', borderRadius: 12, paddingHorizontal: 15, borderWidth: 1, borderColor: '#222' },
    input: { flex: 1, height: 50, color: '#fff' },
    addButton: { width: 50, height: 50, backgroundColor: '#4CAF50', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    btnDisabled: { opacity: 0.4 },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    card: { flexDirection: 'row', backgroundColor: '#161616', borderRadius: 16, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#1f1f1f', alignItems: 'center' },
    activeCard: { borderColor: '#4CAF50', backgroundColor: '#0d150d' },
    cardInfo: { flex: 1 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    urlLabel: { color: '#666', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    urlText: { color: '#bbb', fontSize: 13 },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    deleteBtn: { padding: 8 },
    modal: { backgroundColor: '#161616', padding: 25, borderRadius: 20, alignItems: 'center' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    modalBody: { color: '#888', textAlign: 'center', marginBottom: 20 },
    modalButtons: { flexDirection: 'row', gap: 15 },
    modalCancel: { flex: 1, padding: 12, backgroundColor: '#333', borderRadius: 10, alignItems: 'center' },
    modalConfirm: { flex: 1, padding: 12, backgroundColor: '#FF5733', borderRadius: 10, alignItems: 'center' },
});

export default EditUrl;