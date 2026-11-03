import { Tabs, usePathname } from 'expo-router';
import { Home, Users, BookOpen, Heart, Shield } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import { requestHomeScrollToTop } from '@/lib/homeScroll';

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
  const pathname = usePathname();
  // Wave 2, fix 1 (feedback #19): a Home tab tap scrolls Home to the
  // top ONLY when Home is already the focused tab. Tapping Home from
  // another tab just switches (standard iOS behaviour) — scrolling
  // there would yank a user who left Home mid-scroll back to the top
  // unasked. The pathname check is the expo-router-safe replacement
  // for a navigation `isFocused()` call (no @react-navigation imports
  // under SDK 56+). The root '/' redirect resolves to the Home route,
  // so both spellings count as Home.

  const styles = StyleSheet.create({
    label: {
      fontSize: T.size.tabLabel,
      lineHeight: T.leading.tabLabel,
      letterSpacing: 0.2,
      marginTop: 4,
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
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <View style={[styles.iconBadge, focused ? styles.iconGlow : null]}>
          {React.cloneElement(icon as React.ReactElement<{ color?: ColorValue }>, { color })}
        </View>
      );
    };

  const renderLabel = (text: string) =>
    function TabLabel({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          // Floor-preserving shrink: label base is T.scale(12) = 13.8pt
          // effective, so 0.97 is the lowest scale that never drops
          // below the 13.4pt legibility floor (13.8 * 0.97 = 13.4).
          minimumFontScale={0.97}
          maxFontSizeMultiplier={1.25}
          style={[styles.label, { color, fontFamily: focused ? Fonts.titleBold : Fonts.titleMedium }]}
        >
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
          left: 16,
          right: 16,
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
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        listeners={{
          tabPress: () => {
            if (pathname === '/(tabs)/(home)' || pathname === '/') {
              requestHomeScrollToTop();
            }
          },
        }}
        options={{
          title: 'Home',
          tabBarIcon: renderIcon(<Home size={22} />),
          tabBarLabel: renderLabel('Home'),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: renderIcon(<Users size={22} />),
          tabBarLabel: renderLabel('Community'),
        }}
      />
      <Tabs.Screen
        name="declarations"
        options={{
          title: 'Truth',
          tabBarIcon: renderIcon(<Shield size={22} />),
          tabBarLabel: renderLabel('Truth'),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: renderIcon(<BookOpen size={22} />),
          tabBarLabel: renderLabel('Journal'),
        }}
      />
      <Tabs.Screen
        name="give"
        options={{
          title: 'Support',
          tabBarIcon: renderIcon(<Heart size={22} />),
          tabBarLabel: renderLabel('Support'),
        }}
      />
    </Tabs>
  );
}
