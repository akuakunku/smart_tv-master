import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FavoriteContext = createContext<any>(null);

export const FavoriteProvider = ({ children }: any) => {
  const [favorites, setFavorites] = useState<any[]>([]);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const stored = await AsyncStorage.getItem('favorites');
      if (stored) setFavorites(JSON.parse(stored));
    } catch (e) {
      console.error("Gagal memuat favorit", e);
    }
  };

  // Fungsi helper untuk mengecek status favorit
  const isFavorite = (url: string) => {
    return favorites.some((fav: any) => fav.url === url);
  };

  const toggleFavorite = async (item: any) => {
    try {
      let updated;
      if (isFavorite(item.url)) {
        updated = favorites.filter((fav: any) => fav.url !== item.url);
      } else {
        updated = [...favorites, item];
      }
      setFavorites(updated);
      await AsyncStorage.setItem('favorites', JSON.stringify(updated));
    } catch (e) {
      console.error("Gagal toggle favorit", e);
    }
  };

  return (
    <FavoriteContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </FavoriteContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoriteContext);
  if (!context) {
    throw new Error("useFavorites must be used within a FavoriteProvider");
  }
  return context;
};