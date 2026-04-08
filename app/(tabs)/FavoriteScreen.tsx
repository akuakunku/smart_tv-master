import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Dimensions, Platform, StatusBar } from 'react-native';
import { useFavorites } from '../../contexts/FavoriteContext';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../../constants/Colors';

const { width } = Dimensions.get('window');

export default function FavoriteScreen({ navigation }: any) {
  const { favorites } = useFavorites();

  const renderItem = ({ item }: any) => (
    <TouchableOpacity 
      activeOpacity={0.7}
      style={styles.card}
      onPress={() => {
        navigation.navigate('Home', {
          screen: 'PlayerScreen',    
          params: { url: item.url } 
        });
      }}
    >
      <Image 
        source={{ uri: item.logo || 'https://via.placeholder.com/150' }} 
        style={styles.image} 
      />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.group}>{item.group || "General Channel"}</Text>
      </View>
      <View style={styles.playButton}>
        <Ionicons name="play" size={20} color="#000" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* HEADER DENGAN TOMBOL BACK */}
      <View style={styles.headerContainer}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Koleksi <Text style={{color: Colors.primary}}>Favorit</Text>
        </Text>
        <View style={{ width: 40 }} /> 
      </View>
      
      {favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="heart-dislike-outline" size={60} color="#444" />
          </View>
          <Text style={styles.emptyText}>Belum ada channel favorit.</Text>
          <Text style={styles.emptySubText}>Simpan channel favoritmu agar muncul di sini.</Text>
          
          <TouchableOpacity 
            style={styles.btnExplore}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.btnText}>Cari Channel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.url}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#050505' 
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 55 : 45,
    paddingBottom: 20,
    backgroundColor: 'rgba(5,5,5,0.8)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#151515',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '900', 
    color: '#fff',
    letterSpacing: 0.5 
  },
  listContent: { 
    padding: 20,
    paddingBottom: 100 
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#181818',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  image: { 
    width: 55, 
    height: 55, 
    borderRadius: 12, 
    marginRight: 15,
    backgroundColor: '#222' 
  },
  info: { 
    flex: 1 
  },
  name: { 
    color: '#fff', 
    fontSize: 15, 
    fontWeight: '700' 
  },
  group: { 
    color: '#666', 
    fontSize: 11, 
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1 
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  emptyContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    paddingHorizontal: 40 
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#151515',
    marginBottom: 20,
  },
  emptyText: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: '700',
    textAlign: 'center' 
  },
  emptySubText: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  btnExplore: { 
    backgroundColor: Colors.primary, 
    paddingHorizontal: 35, 
    paddingVertical: 14, 
    borderRadius: 30, 
    marginTop: 30,
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5
  },
  btnText: { 
    fontWeight: '900', 
    color: '#000',
    textTransform: 'uppercase',
    fontSize: 14 
  }
});