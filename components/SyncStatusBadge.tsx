import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react-native';
import { SyncService, SyncStatus } from '@/lib/syncService';
import { Fonts } from '@/constants/fonts';

export default function SyncStatusBadge() {
  const [status, setStatus] = useState<SyncStatus>(SyncService.currentStatus);
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<NodeJS.Timeout | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const unsub = SyncService.addStatusListener((s) => {
      setStatus(s);
      if (s === 'idle') return;

      if (hideTimer.current) clearTimeout(hideTimer.current);

      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

      if (s === 'saving') {
        spinLoop.current = Animated.loop(
          Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })
        );
        spinLoop.current.start();
      } else {
        spinLoop.current?.stop();
        spinAnim.setValue(0);
        hideTimer.current = setTimeout(() => {
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
            setVisible(false);
          });
        }, 2500);
      }
    });

    return () => {
      unsub();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      spinLoop.current?.stop();
    };
  }, [opacity, spinAnim]);

  if (!visible) return null;

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const config = {
    saving: { label: 'Saving...', color: 'rgba(200,137,74,0.7)', icon: <Animated.View style={{ transform: [{ rotate: spin }] }}><RefreshCw size={10} color="rgba(200,137,74,0.85)" /></Animated.View> },
    synced: { label: 'Synced', color: 'rgba(142,176,132,0.7)', icon: <Cloud size={10} color="rgba(142,176,132,0.9)" /> },
    offline: { label: 'Saved locally', color: 'rgba(200,137,74,0.5)', icon: <CloudOff size={10} color="rgba(200,137,74,0.7)" /> },
    idle: { label: '', color: 'transparent', icon: null },
  }[status];

  return (
    <Animated.View style={[styles.badge, { opacity }]}>
      {config.icon}
      <Text style={[styles.label, { color: config.color, fontFamily: Fonts.titleMedium }]}>
        {config.label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(200,137,74,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.1)',
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
