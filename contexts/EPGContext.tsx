import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface EpgUrl {
  url: string;
  active: boolean;
  isDefault?: boolean;
}

interface EPGContextType {
  epgUrls: EpgUrl[];
  addEpgUrl: (url: string) => Promise<void>;
  deleteEpgUrl: (url: string) => Promise<void>;
  toggleEpgUrl: (url: string) => Promise<void>;
  refreshEPG: () => Promise<void>;
  loading: boolean;
}

const EPGContext = createContext<EPGContextType | undefined>(undefined);

// Sumber default sistem
const DEFAULT_SOURCES = ["https://iptv-epg.org/files/epg-id.xml"];

export const EPGProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [epgUrls, setEpgUrls] = useState<EpgUrl[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStoredUrls();
  }, []);

  const loadStoredUrls = async () => {
    try {
      const stored = await AsyncStorage.getItem('epgUrls');
      let finalUrls: EpgUrl[] = [];

      if (stored) {
        const parsed: EpgUrl[] = JSON.parse(stored);
         const userUrls = parsed.filter(u => !u.isDefault);
        const systemUrls = DEFAULT_SOURCES.map(url => {
          const existing = parsed.find(p => p.url === url && p.isDefault);
          return existing ? existing : { url, active: true, isDefault: true };
        });
        finalUrls = [...systemUrls, ...userUrls];
      } else {
        finalUrls = DEFAULT_SOURCES.map(url => ({ url, active: true, isDefault: true }));
      }
      
      setEpgUrls(finalUrls);
      await AsyncStorage.setItem('epgUrls', JSON.stringify(finalUrls));
    } catch (e) {
      console.error("Context Load Error:", e);
    }
  };

  const addEpgUrl = async (url: string) => {
    const newList = [...epgUrls, { url, active: true, isDefault: false }];
    setEpgUrls(newList);
    await AsyncStorage.setItem('epgUrls', JSON.stringify(newList));
  };

  const deleteEpgUrl = async (url: string) => {
    const newList = epgUrls.filter(item => item.url !== url);
    setEpgUrls(newList);
    await AsyncStorage.setItem('epgUrls', JSON.stringify(newList));
  };

  const toggleEpgUrl = async (url: string) => {
    const newList = epgUrls.map(item => 
      item.url === url ? { ...item, active: !item.active } : item
    );
    setEpgUrls(newList);
    await AsyncStorage.setItem('epgUrls', JSON.stringify(newList));
  };

  const refreshEPG = async () => {
    setLoading(true);
    try {
      await AsyncStorage.removeItem('lastUpdated');
      await AsyncStorage.removeItem('epgData_main');
      await new Promise(resolve => setTimeout(resolve, 800));
    } finally {
      setLoading(false);
    }
  };

  return (
    <EPGContext.Provider value={{ epgUrls, addEpgUrl, deleteEpgUrl, toggleEpgUrl, refreshEPG, loading }}>
      {children}
    </EPGContext.Provider>
  );
};

export const useEPG = () => {
  const context = useContext(EPGContext);
  if (context === undefined) {
    throw new Error("useEPG must be used within EPGProvider");
  }
  return context;
};