import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
    Alert,
} from "react-native";
import Modal from "react-native-modal";
import Icon from "react-native-vector-icons/FontAwesome";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useM3uParse from "../../hooks/M3uParse";
import axios from 'axios';
import Toast from "react-native-toast-message";

const ACTIVE_URL_KEY = "active_m3u_url";

const EditUrl = () => {
    const {
        userUrls = [],
        addUrl: addUserUrl,
        deleteUrl: deleteUserUrl,
        defaultUrls = [],
        refetch,
        isFetching,
        changeActiveUrl,
        loading,
        error: hookError,
    } = useM3uParse();

    const [newUrl, setNewUrl] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [activeUrl, setActiveUrl] = useState("");
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
    const [localRefreshing, setLocalRefreshing] = useState(false);
    
    const insets = useSafeAreaInsets();
    const [fadeAnim] = useState(new Animated.Value(0));
    const navigation = useNavigation();
    const isMountedRef = useRef(true);

    // Load active URL
    const loadActiveUrl = useCallback(async () => {
        try {
            const storedActive = await AsyncStorage.getItem(ACTIVE_URL_KEY);
            if (storedActive) {
                setActiveUrl(storedActive);
            } else if (defaultUrls.length > 0) {
                const defaultUrl = defaultUrls.find(u => u.enabled)?.url || defaultUrls[0]?.url;
                if (defaultUrl) {
                    setActiveUrl(defaultUrl);
                }
            }
        } catch (error) {
            console.error("Load active URL error:", error);
        }
    }, [defaultUrls]);

    // Initial load
    useEffect(() => {
        isMountedRef.current = true;
        loadActiveUrl();
        
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();

        return () => {
            isMountedRef.current = false;
        };
    }, [loadActiveUrl, fadeAnim]);

    // Refresh active URL when defaultUrls changes
    useEffect(() => {
        loadActiveUrl();
    }, [defaultUrls, loadActiveUrl]);

    // Show error from hook
    useEffect(() => {
        if (hookError) {
            Toast.show({ 
                type: 'error', 
                text1: 'Error', 
                text2: hookError,
                visibilityTime: 3000,
            });
        }
    }, [hookError]);

    const validateM3uUrl = useCallback(async (url: string): Promise<boolean> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await axios.get(url, { 
                timeout: 10000,
                signal: controller.signal,
                headers: {
                    'Accept': '*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            clearTimeout(timeoutId);
            
            // Check if response contains M3U header
            const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            return data.includes("#EXTM3U");
        } catch (error) {
            console.error("Validation error:", error);
            return false;
        }
    }, []);

    const handleAddUrl = useCallback(async () => {
        const trimmedUrl = newUrl.trim();
        
        if (!trimmedUrl) {
            Toast.show({ type: 'error', text1: 'URL Kosong', text2: 'Masukkan URL playlist' });
            return;
        }
        
        if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
            Toast.show({ type: 'error', text1: 'URL Tidak Valid', text2: 'Harus dimulai dengan http:// atau https://' });
            return;
        }

        // Check if URL already exists
        const urlExists = [...defaultUrls.map(d => d.url), ...userUrls].some(u => u === trimmedUrl);
        if (urlExists) {
            Toast.show({ type: 'error', text1: 'URL Sudah Ada', text2: 'Playlist ini sudah terdaftar' });
            return;
        }

        setIsProcessing(true);
        setIsValidating(true);
        Keyboard.dismiss();

        try {
            const isValid = await validateM3uUrl(trimmedUrl);
            
            if (isValid) {
                const success = await addUserUrl(trimmedUrl);
                if (success && isMountedRef.current) {
                    setNewUrl("");
                    Toast.show({ type: 'success', text1: 'Berhasil', text2: 'Playlist ditambahkan' });
                    
                    // Auto activate if this is the first user URL
                    if (userUrls.length === 0) {
                        setTimeout(() => handleToggleUrl(trimmedUrl), 500);
                    }
                } else {
                    Toast.show({ type: 'error', text1: 'Gagal', text2: 'Tidak dapat menambahkan URL' });
                }
            } else {
                Toast.show({ type: 'error', text1: 'Format Salah', text2: 'File bukan playlist M3U yang valid' });
            }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Gagal', text2: 'Tidak dapat menjangkau URL atau timeout' });
        } finally {
            if (isMountedRef.current) {
                setIsProcessing(false);
                setIsValidating(false);
            }
        }
    }, [newUrl, addUserUrl, userUrls, validateM3uUrl]);

    const handleToggleUrl = useCallback(async (url: string) => {
        if (url === activeUrl || isProcessing || isFetching) return;
        
        setIsProcessing(true);
        
        try {
            setActiveUrl(url);
            const success = await changeActiveUrl(url);
            
            if (success && isMountedRef.current) {
                Toast.show({ 
                    type: 'success', 
                    text1: 'Playlist Aktif', 
                    text2: 'Saluran akan diperbarui',
                    visibilityTime: 1500,
                });
            } else {
                // Revert jika gagal
                await loadActiveUrl();
                Toast.show({ type: 'error', text1: 'Gagal', text2: 'Tidak dapat mengaktifkan playlist' });
            }
        } catch (error) {
            console.error("Toggle URL error:", error);
            await loadActiveUrl();
            Toast.show({ type: 'error', text1: 'Gagal', text2: 'Terjadi kesalahan' });
        } finally {
            if (isMountedRef.current) {
                setIsProcessing(false);
            }
        }
    }, [activeUrl, isProcessing, isFetching, changeActiveUrl, loadActiveUrl]);

    const confirmDelete = useCallback(async () => {
        if (!selectedUrl) return;
        
        setIsProcessing(true);
        
        try {
            const success = await deleteUserUrl(selectedUrl);
            
            if (success && isMountedRef.current) {
                setModalVisible(false);
                
                // Jika URL yang dihapus adalah active URL
                if (activeUrl === selectedUrl) {
                    const fallback = defaultUrls.find(u => u.enabled)?.url || defaultUrls[0]?.url;
                    if (fallback) {
                        setActiveUrl(fallback);
                        await changeActiveUrl(fallback);
                    }
                }
                
                Toast.show({ type: 'success', text1: 'Terhapus', text2: 'Playlist dihapus dari daftar' });
            }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Gagal', text2: 'Tidak dapat menghapus playlist' });
        } finally {
            if (isMountedRef.current) {
                setIsProcessing(false);
                setSelectedUrl(null);
            }
        }
    }, [selectedUrl, deleteUserUrl, activeUrl, defaultUrls, changeActiveUrl]);

    const handleRefresh = useCallback(async () => {
        setLocalRefreshing(true);
        await refetch();
        await loadActiveUrl();
        setLocalRefreshing(false);
    }, [refetch, loadActiveUrl]);

    const combinedUrls = useMemo(() => {
        const defaults = defaultUrls.map((item: any) => ({
            url: item.url,
            name: item.name || "Default Playlist",
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

    const renderItem = useCallback(({ item }: { item: any }) => (
        <View style={[styles.card, item.enabled && styles.activeCard]}>
            <View style={styles.cardInfo}>
                <View style={styles.cardHeader}>
                    <Icon 
                        name={item.isUser ? "user-circle" : "shield"} 
                        size={10} 
                        color={item.enabled ? "#4CAF50" : "#666"} 
                    />
                    <Text style={[styles.urlLabel, item.enabled && { color: '#4CAF50' }]}>
                        {item.name}
                    </Text>
                </View>
                <Text style={styles.urlText} numberOfLines={1}>
                    {item.url}
                </Text>
            </View>
            
            <View style={styles.cardActions}>
                <Switch
                    value={item.enabled}
                    onValueChange={() => handleToggleUrl(item.url)}
                    trackColor={{ false: "#222", true: "#1a3a1a" }}
                    thumbColor={item.enabled ? "#4CAF50" : "#444"}
                    disabled={isProcessing || isFetching}
                />
                {item.isUser && (
                    <TouchableOpacity 
                        style={styles.deleteBtn} 
                        onPress={() => {
                            setSelectedUrl(item.url);
                            setModalVisible(true);
                        }}
                        disabled={isProcessing}
                    >
                        <Icon name="trash" size={16} color="#FF5733" />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    ), [activeUrl, isProcessing, isFetching, handleToggleUrl]);

    const keyExtractor = useCallback((item: any) => item.url, []);

    const refreshing = isFetching || localRefreshing;

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
                    <StatusBar barStyle="light-content" backgroundColor="#0b0b0b" />
                    
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity 
                            style={styles.headerBtn} 
                            onPress={() => navigation.goBack()}
                            disabled={isProcessing}
                        >
                            <Icon name="chevron-left" size={20} color="#fff" />
                        </TouchableOpacity>
                        
                        <Text style={styles.title}>Daftar Playlist</Text>

                        <TouchableOpacity 
                            style={[styles.headerBtn, refreshing && styles.btnDisabled]} 
                            onPress={handleRefresh}
                            disabled={refreshing}
                        >
                            {refreshing ? (
                                <ActivityIndicator size="small" color="#4CAF50" />
                            ) : (
                                <Icon name="refresh" size={18} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Input Section */}
                    <View style={styles.inputSection}>
                        <View style={styles.inputWrapper}>
                            <Icon name="link" size={16} color="#555" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="https://example.com/playlist.m3u"
                                placeholderTextColor="#444"
                                value={newUrl}
                                onChangeText={setNewUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={!isProcessing}
                            />
                        </View>
                        <TouchableOpacity
                            style={[styles.addButton, (!newUrl || isProcessing || isValidating) && styles.btnDisabled]}
                            onPress={handleAddUrl}
                            disabled={!newUrl || isProcessing || isValidating}
                        >
                            {isValidating ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Icon name="plus" size={18} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Loading Indicator */}
                    {loading && combinedUrls.length === 0 && (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#4CAF50" />
                            <Text style={styles.loadingText}>Memuat playlist...</Text>
                        </View>
                    )}

                    {/* List */}
                    <FlatList
                        data={combinedUrls}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={styles.list}
                        refreshControl={
                            <RefreshControl 
                                refreshing={refreshing} 
                                onRefresh={handleRefresh} 
                                tintColor="#4CAF50"
                                colors={["#4CAF50"]}
                            />
                        }
                        renderItem={renderItem}
                        ListEmptyComponent={
                            !loading && (
                                <View style={styles.emptyContainer}>
                                    <Icon name="folder-open" size={48} color="#333" />
                                    <Text style={styles.emptyText}>Belum ada playlist</Text>
                                    <Text style={styles.emptySubText}>Tambahkan playlist M3U di atas</Text>
                                </View>
                            )
                        }
                    />
                </Animated.View>

                {/* Modal Konfirmasi Hapus */}
                <Modal 
                    isVisible={modalVisible} 
                    onBackdropPress={() => setModalVisible(false)}
                    onBackButtonPress={() => setModalVisible(false)}
                    animationIn="fadeIn"
                    animationOut="fadeOut"
                >
                    <View style={styles.modal}>
                        <View style={styles.modalIcon}>
                            <Icon name="exclamation-triangle" size={40} color="#FF5733" />
                        </View>
                        <Text style={styles.modalTitle}>Hapus Playlist?</Text>
                        <Text style={styles.modalBody}>
                            Playlist ini akan dihapus dari daftar Anda.
                            {activeUrl === selectedUrl && " Playlist ini sedang aktif."}
                        </Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity 
                                style={styles.modalCancel} 
                                onPress={() => setModalVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.modalCancelText}>Batal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={styles.modalConfirm} 
                                onPress={confirmDelete}
                                activeOpacity={0.7}
                                disabled={isProcessing}
                            >
                                {isProcessing ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.modalConfirmText}>Hapus</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </View>
        </TouchableWithoutFeedback>
    );
};

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: '#0b0b0b' 
    },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    headerBtn: { 
        width: 44, 
        height: 44, 
        borderRadius: 22, 
        backgroundColor: '#161616', 
        justifyContent: 'center', 
        alignItems: 'center', 
        borderWidth: 1, 
        borderColor: '#222' 
    },
    title: { 
        color: '#fff', 
        fontSize: 18, 
        fontWeight: 'bold' 
    },
    inputSection: { 
        flexDirection: 'row', 
        paddingHorizontal: 20, 
        marginBottom: 20, 
        gap: 12 
    },
    inputWrapper: { 
        flex: 1, 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#161616', 
        borderRadius: 12, 
        paddingHorizontal: 16, 
        borderWidth: 1, 
        borderColor: '#222' 
    },
    inputIcon: {
        marginRight: 10,
    },
    input: { 
        flex: 1, 
        height: 50, 
        color: '#fff',
        fontSize: 14,
    },
    addButton: { 
        width: 50, 
        height: 50, 
        backgroundColor: '#4CAF50', 
        borderRadius: 12, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    btnDisabled: { 
        opacity: 0.5 
    },
    list: { 
        paddingHorizontal: 20, 
        paddingBottom: 40 
    },
    card: { 
        flexDirection: 'row', 
        backgroundColor: '#161616', 
        borderRadius: 16, 
        padding: 16, 
        marginBottom: 12, 
        borderWidth: 1, 
        borderColor: '#1f1f1f', 
        alignItems: 'center' 
    },
    activeCard: { 
        borderColor: '#4CAF50', 
        backgroundColor: '#0d150d' 
    },
    cardInfo: { 
        flex: 1 
    },
    cardHeader: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 8, 
        marginBottom: 6 
    },
    urlLabel: { 
        color: '#666', 
        fontSize: 11, 
        fontWeight: 'bold', 
        textTransform: 'uppercase' 
    },
    urlText: { 
        color: '#bbb', 
        fontSize: 12 
    },
    cardActions: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 12 
    },
    deleteBtn: { 
        padding: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 87, 51, 0.1)',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 60,
    },
    loadingText: {
        color: '#888',
        marginTop: 12,
        fontSize: 14,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        paddingHorizontal: 40,
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
        fontWeight: '500',
        marginTop: 16,
    },
    emptySubText: {
        color: '#444',
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center',
    },
    modal: { 
        backgroundColor: '#161616', 
        padding: 24, 
        borderRadius: 20, 
        alignItems: 'center' 
    },
    modalIcon: {
        marginBottom: 16,
    },
    modalTitle: { 
        color: '#fff', 
        fontSize: 18, 
        fontWeight: 'bold', 
        marginBottom: 8 
    },
    modalBody: { 
        color: '#888', 
        textAlign: 'center', 
        marginBottom: 24,
        fontSize: 14,
    },
    modalButtons: { 
        flexDirection: 'row', 
        gap: 12,
        width: '100%',
    },
    modalCancel: { 
        flex: 1, 
        paddingVertical: 12, 
        backgroundColor: '#333', 
        borderRadius: 10, 
        alignItems: 'center' 
    },
    modalCancelText: {
        color: '#fff',
        fontWeight: '500',
    },
    modalConfirm: { 
        flex: 1, 
        paddingVertical: 12, 
        backgroundColor: '#FF5733', 
        borderRadius: 10, 
        alignItems: 'center' 
    },
    modalConfirmText: {
        color: '#fff',
        fontWeight: 'bold',
    },
});

export default EditUrl;