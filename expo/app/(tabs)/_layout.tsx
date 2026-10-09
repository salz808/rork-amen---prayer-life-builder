import { Tabs } from 'expo-router';
import { Home, Users, BookOpen, Heart, Shield } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';

/**
 * Bottom tab bar — a floating pill with five destinations.
 *
 * Order follows the daily rhythm: pray (Home) → belong (Community) →
 * stand firm (Truth) → reflect (Journal) → give (Support last — seen,
 * but never in the way).
 *
 * - Labels are sentence case at the typography floor.
 * - Active state is unmistakable: accent tint + soft pill glow behind the
 *   icon + bold label, not a color swap alone.
 * - "Truth" carries a Shield — declarations are identity you stand on.
 */
export default function TabLayout() {
  const C = useColors();
  const T = useTypography();
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    label: {
      fontSize: T.scale(12),
      letterSpacing: 0.2,
      marginTop: 3,
    },
    iconBadge: {
      width: 36,
      height: 25,
      borderRadius: 999,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    iconGlow: {
      backgroundColor: C.accentBg,
    },
  });

  const renderIcon = (icon: React.ReactNode) =>
    function TabIcon({ color, focused }: { color: string; focused: boolean }) {
      return (
        <View style={[styles.iconBadge, focused ? styles.iconGlow : null]}>
          {React.cloneElement(icon as React.ReactElement<{ color?: string }>, { color })}
        </View>
      );
    };

  const renderLabel = (text: string) =>
    function TabLabel({ color, focused }: { color: string; focused: boolean }) {
      return (
        <Text style={[styles.label, { color, fontFamily: focused ? Fonts.titleBold : Fonts.titleMedium }]}>
          {text}
        </Text>
      );
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.tabBarInactive,
        tabBarStyle: {
          position: 'absolute',
          bottom: Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 18),
          left: 24,
          right: 24,
          backgroundColor: C.tabBarBg,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: C.tabBarBorder,
          borderRadius: 22,
          ...(Platform.OS !== 'web' ? {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.5,
            shadowRadius: 32,
          } : {}),
          elevation: 16,
        },
        tabBarShowLabel: true,
        tabBarItemStyle: {
          paddingTop: 7,
          paddingBottom: 7,
        },
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Home',
          tabBarIcon: renderIcon(<Home size={19} />),
          tabBarLabel: renderLabel('Home'),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: renderIcon(<Users size={19} />),
          tabBarLabel: renderLabel('Community'),
        }}
      />
      <Tabs.Screen
        name="declarations"
        options={{
          title: 'Truth',
          tabBarIcon: renderIcon(<Shield size={19} />),
          tabBarLabel: renderLabel('Truth'),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: renderIcon(<BookOpen size={19} />),
          tabBarLabel: renderLabel('Journal'),
        }}
      />
      <Tabs.Screen
        name="give"
        options={{
          title: 'Support',
          tabBarIcon: renderIcon(<Heart size={19} />),
          tabBarLabel: renderLabel('Support'),
        }}
      />
    </Tabs>
  );
}
