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
 * stand firm (Truth) → reflect (Journal) → give (Give last — seen,
 * but never in the way).
 *
 * - Labels are sentence case at the typography floor.
 * - Active state is unmistakable WITHOUT color alone: accent tint +
 *   soft pill glow behind the icon + bold label + a small dot under
 *   the icon (arena-audit fix pass, 2026-11-15). The dot is always
 *   laid out (transparent when inactive) so switching tabs never
 *   shifts the bar.
 * - "Declare" carries a Shield — declarations are identity you stand on.
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
    // Arena-audit fix pass (2026-11-15): active-tab dot under the icon.
    // The column keeps the dot centred under the badge; the dot itself
    // is always laid out (transparent when inactive) so the active tab
    // never grows the bar or shifts its neighbours.
    iconColumn: {
      alignItems: 'center' as const,
    },
    activeDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      marginTop: 3,
      backgroundColor: 'transparent',
    },
    activeDotOn: {
      backgroundColor: C.accent,
    },
  });

  const renderIcon = (icon: React.ReactNode) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <View style={styles.iconColumn}>
          <View style={[styles.iconBadge, focused ? styles.iconGlow : null]}>
            {React.cloneElement(icon as React.ReactElement<{ color?: ColorValue }>, { color })}
          </View>
          <View style={[styles.activeDot, focused ? styles.activeDotOn : null]} />
        </View>
      );
    };

  // Arena audit (2026-11-15): the screenshots showed icons only — no
  // labels — even though tabBarShowLabel was true and a label component
  // was passed. The fix is twofold: (1) this is a render *function*
  // returning the element — BottomTabBar calls it directly with
  // {focused, color, ...}, never renders it as JSX — kept as a named
  // function so react/display-name stays happy; (2) the geometry fix
  // in tabBarStyle below — the bar's content box was only ~30pt tall,
  // so the label had no room inside the pill.
  const renderLabel = (text: string) =>
    function TabLabel({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <Text
          numberOfLines={1}
          // Wave 3: no per-label shrink (floor rule 3) — the tabLabel
          // token (12pt) is sized for the longest label, "Community",
          // at full width, so it never needs to shrink below its peers.
          // maxFontSizeMultiplier stays: it caps OS Dynamic Type on the
          // pill, matching the token policy in constants/typography.ts.
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
          // Arena audit (2026-11-15): the old 64pt height never fit the
          // label. React Navigation reserves insets.bottom (~34pt) as
          // padding *inside* the bar, so the content box was only ~30pt
          // for ~71pt of content (item padding 16 + button padding 10 +
          // badge 25 + label margin 4 + label 16). The pill already
          // floats above the home indicator via `bottom` above, so it
          // needs no internal bottom padding: paddingBottom 0 here
          // overrides the computed inset, and 80pt gives the full
          // ~78pt of content room — the 71pt above plus the active dot
          // (~4pt + ~3 margin) added in the same pass.
          height: 80,
          paddingBottom: 0,
          ...(Platform.OS !== 'web' ? {
            // 4-angle audit polish: the tab bar floated on a shadow ~6x
            // heavier than the sheets (0.5/32/-8 vs the sheet's
            // 0.08/14/-4 in components/SettingsSheet.tsx). It now matches
            // the sheet weight exactly — same upward cast, same softness.
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.08,
            shadowRadius: 14,
          } : {}),
          elevation: 8,
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
          title: 'Declare',
          tabBarIcon: renderIcon(<Shield size={22} />),
          tabBarLabel: renderLabel('Declare'),
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
          title: 'Give',
          tabBarIcon: renderIcon(<Heart size={22} />),
          tabBarLabel: renderLabel('Give'),
        }}
      />
    </Tabs>
  );
}
