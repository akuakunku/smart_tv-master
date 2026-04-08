import React, { useEffect, useState, useCallback, useRef } from "react";
import { ActivityIndicator, View, Text, StyleSheet, Animated, useWindowDimensions } from "react-native";
import { DateTime } from "luxon";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEPG } from '../contexts/EPGContext';
import { LinearGradient } from "expo-linear-gradient";
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

interface EPGInfoProps { tvgId: string | null; channelName: string; }

const EPGInfo: React.FC<EPGInfoProps> = ({ tvgId, channelName }) => {
  const [current, setCurrent] = useState<any>(null);
  const [next, setNext] = useState<any>(null);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const { width } = useWindowDimensions();
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const { epgUrls } = useEPG();

  const formatTime = (t: string) => {
    if(!t) return "--:--";
    return DateTime.fromFormat(t.substring(0,14), "yyyyMMddHHmmss", { zone: "UTC" })
      .setZone("Asia/Jakarta")
      .toFormat("HH:mm");
  };

  const processXML = async () => {
    setLoading(true);
    try {
      const activeUrls = epgUrls.filter(u => u.active).map(u => u.url);
      let allChannels: any = {};
      const nowStr = DateTime.now().setZone("UTC").toFormat("yyyyMMddHHmmss");

      for (const url of activeUrls) {
        try {
          const res = await axios.get(url, { timeout: 15000 });
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
          const parsed = parser.parse(res.data);
          const programs = Array.isArray(parsed?.tv?.programme) ? parsed.tv.programme : [parsed?.tv?.programme];

          programs.forEach((p: any) => {
            if (p && p.channel && parseInt(p.stop) > parseInt(nowStr)) {
              if (!allChannels[p.channel]) allChannels[p.channel] = { programme: [] };
              allChannels[p.channel].programme.push({
                start: p.start, 
                stop: p.stop,
                title: typeof p.title === 'string' ? p.title : p.title?.["#text"] || "Acara TV"
              });
            }
          });
        } catch (e) { console.warn("Failed to fetch:", url); }
      }
      
      await AsyncStorage.setItem('epgData_main', JSON.stringify(allChannels));
      await AsyncStorage.setItem('lastUpdated', Date.now().toString());
      return allChannels;
    } catch (e) {
      return {};
    }
  };

  const loadData = useCallback(async () => {
    try {
      const lastUpd = await AsyncStorage.getItem('lastUpdated');
      const cached = await AsyncStorage.getItem('epgData_main');
      
      let data = (lastUpd && Date.now() - parseInt(lastUpd) < 3600000) // Cache 1 jam
        ? JSON.parse(cached || '{}') 
        : await processXML();

      const channelProgs = data[tvgId?.trim() || ""];
      if (channelProgs) {
        const now = DateTime.now().setZone("UTC").toFormat("yyyyMMddHHmmss");
        const sorted = channelProgs.programme.sort((a: any, b: any) => parseInt(a.start) - parseInt(b.start));
        
        const curr = sorted.find((p: any) => parseInt(p.start) <= parseInt(now) && parseInt(p.stop) > parseInt(now));
        const fut = sorted.filter((p: any) => parseInt(p.start) > parseInt(now));

        setCurrent(curr);
        setNext(fut[0]);
        setUpcoming(fut.slice(0, 10));
      }
    } finally {
      setLoading(false);
    }
  }, [tvgId, epgUrls]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (upcoming.length > 0) {
      scrollAnim.setValue(width);
      const animation = Animated.loop(
        Animated.timing(scrollAnim, { 
          toValue: -width * 2, 
          duration: 18000, 
          useNativeDriver: true,
          isInteraction: false 
        })
      );
      animation.start();
      return () => animation.stop();
    }
  }, [upcoming, width]);

  if (loading) return <ActivityIndicator color="#e3c800" style={{ margin: 15 }} />;

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#222", "#111"]} style={styles.card}>
        <View style={styles.row}>
          <View style={styles.infoBox}>
            <Text style={styles.status}>SEDANG TAYANG</Text>
            <Text style={styles.programTitle} numberOfLines={1}>{current?.title || "Tidak ada informasi"}</Text>
            <Text style={styles.time}>{current ? `${formatTime(current.start)} - ${formatTime(current.stop)}` : "--:--"}</Text>
          </View>
          <View style={[styles.infoBox, styles.borderLeft]}>
            <Text style={styles.status}>BERIKUTNYA</Text>
            <Text style={styles.programTitle} numberOfLines={1}>{next?.title || "Tidak ada informasi"}</Text>
            <Text style={styles.time}>{next ? `${formatTime(next.start)} - ${formatTime(next.stop)}` : "--:--"}</Text>
          </View>
        </View>
      </LinearGradient>
      
      {upcoming.length > 0 && (
        <View style={styles.marquee}>
          <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: scrollAnim }] }}>
            {upcoming.map((p, i) => (
              <Text key={i} style={styles.marqueeText}>  • {formatTime(p.start)}: {p.title}  </Text>
            ))}
          </Animated.View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 10 },
  card: { borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#333' },
  row: { flexDirection: 'row' },
  infoBox: { flex: 1, paddingHorizontal: 5 },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: '#333', paddingLeft: 10 },
  status: { color: '#e3c800', fontSize: 9, fontWeight: 'bold' },
  programTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold', marginVertical: 3 },
  time: { color: '#888', fontSize: 11 },
  marquee: { marginTop: 10, backgroundColor: '#000', paddingVertical: 6, borderRadius: 4, overflow: 'hidden' },
  marqueeText: { color: '#e3c800', fontSize: 11, fontWeight: '500' }
});

export default EPGInfo;