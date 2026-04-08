import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, 
  Alert, Switch, ActivityIndicator, Keyboard, StatusBar, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEPG } from '../../contexts/EPGContext';
import axios from 'axios';

const EditEpg = () => {
  const navigation = useNavigation();
  const { epgUrls, addEpgUrl, deleteEpgUrl, toggleEpgUrl, refreshEPG, loading } = useEPG();
  const [newUrl, setNewUrl] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleAdd = async () => {
    const cleanUrl = newUrl.trim();
    if (!cleanUrl.startsWith('http')) {
      return Alert.alert("URL Tidak Valid", "URL harus diawali dengan http:// atau https://");
    }
    if (epgUrls.some(e => e.url === cleanUrl)) {
      return Alert.alert("Duplikat", "URL EPG ini sudah terdaftar.");
    }

    setIsVerifying(true);
    try {
      const res = await axios.get(cleanUrl, { timeout: 8000 });
      if (res.data && String(res.data).includes('<tv')) {
        await addEpgUrl(cleanUrl);
        setNewUrl("");
        Keyboard.dismiss();
        Alert.alert("Berhasil", "Sumber EPG berhasil ditambahkan.");
      } else {
        throw new Error("Format salah");
      }
    } catch (e) {
      Alert.alert("Gagal Verifikasi", "URL tidak dapat dijangkau atau bukan format XML TV (EPG) yang valid.");
    } finally {
      setIsVerifying(false);
    }
  };

  const confirmDelete = (url: string) => {
    Alert.alert(
      "Hapus EPG",
      "Apakah Anda yakin ingin menghapus sumber EPG ini?",
      [
        { text: "Batal", style: "cancel" },
        { text: "Hapus", style: "destructive", onPress: () => deleteEpgUrl(url) }
      ]
    );
  };

  return (
    <View style={styles.mainContainer}>
      {/* Set StatusBar agar tidak translucent sehingga konten otomatis terdorong ke bawah */}
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent={false} />
      
      <View style={styles.contentWrapper}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity 
              style={styles.backBtn} 
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Manajemen EPG</Text>
          </View>
          
          <TouchableOpacity 
            style={styles.refreshBtn}
            onPress={refreshEPG} 
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#e3c800" />
            ) : (
              <Ionicons name="cloud-download-outline" size={24} color="#e3c800" />
            )}
          </TouchableOpacity>
        </View>

        {/* INPUT SECTION */}
        <View style={styles.inputSection}>
          <View style={styles.inputWrapper}>
            <Ionicons name="link" size={20} color="#666" style={{ marginLeft: 10 }} />
            <TextInput 
              style={styles.input} 
              placeholder="Masukkan URL XML EPG..." 
              placeholderTextColor="#666"
              value={newUrl}
              onChangeText={setNewUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <TouchableOpacity 
            style={[styles.addButton, { opacity: isVerifying || !newUrl ? 0.6 : 1 }]} 
            onPress={handleAdd} 
            disabled={isVerifying || !newUrl}
          >
            {isVerifying ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Ionicons name="add" size={28} color="#000" />
            )}
          </TouchableOpacity>
        </View>

        {/* LIST SECTION */}
        <FlatList 
          data={epgUrls}
          keyExtractor={item => item.url}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="list-outline" size={60} color="#333" />
              <Text style={styles.emptyText}>Belum ada sumber EPG tambahan</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.urlText} numberOfLines={1}>{item.url}</Text>
                {item.isDefault && (
                  <View style={styles.badge}>
                    <Text style={styles.systemBadge}>SISTEM</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.actions}>
                <Switch 
                  value={item.active} 
                  onValueChange={() => toggleEpgUrl(item.url)} 
                  trackColor={{ false: "#333", true: "#e3c800" }}
                  thumbColor={item.active ? "#fff" : "#888"}
                />
                {!item.isDefault && (
                  <TouchableOpacity 
                    onPress={() => confirmDelete(item.url)} 
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash" size={22} color="#ff4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  contentWrapper: {
    flex: 1,
    // Tambahkan padding manual untuk iOS agar tidak tertutup notch, 
    // Android biasanya aman jika translucent={false}
    paddingTop: Platform.OS === 'ios' ? 44 : 0, 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 15, 
    paddingVertical: 15, 
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a'
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { padding: 5, marginRight: 10 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  refreshBtn: { padding: 8, backgroundColor: '#1a1a1a', borderRadius: 10 },
  
  inputSection: { flexDirection: 'row', padding: 15, gap: 10 },
  inputWrapper: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1a1a1a', 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333'
  },
  input: { 
    flex: 1, 
    padding: 12, 
    color: '#fff', 
    fontSize: 14 
  },
  addButton: { 
    backgroundColor: '#e3c800', 
    width: 50, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },

  listContent: { paddingBottom: 20 },
  card: { 
    backgroundColor: '#111', 
    marginHorizontal: 15, 
    marginBottom: 12, 
    padding: 15, 
    borderRadius: 15, 
    flexDirection: 'row', 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a'
  },
  cardInfo: { flex: 1, marginRight: 10 },
  urlText: { color: '#eee', fontSize: 13, fontWeight: '500' },
  badge: {
    backgroundColor: 'rgba(227, 200, 0, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6
  },
  systemBadge: { color: '#e3c800', fontSize: 10, fontWeight: 'bold' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteBtn: { 
    padding: 8, 
    backgroundColor: 'rgba(255, 68, 68, 0.1)', 
    borderRadius: 8 
  },
  
  emptyState: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 100 
  },
  emptyText: { color: '#444', marginTop: 10, fontSize: 14 }
});

export default EditEpg;