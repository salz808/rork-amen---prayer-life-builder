import { Tabs } from 'expo-router';
import { Home, BookOpen, BarChart3, Heart } from 'lucide-react-native';
import React from 'react';
import { Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function TabLayout() {
  const C = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.tabBarInactive,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'web' ? 12 : 18,
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
          paddingTop: 6,
          paddingBottom: 6,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '500' as const,
          letterSpacing: 1.2,
          textTransform: 'uppercase' as const,
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size - 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color, size }) => <BookOpen size={size - 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="journey"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, size }) => <BarChart3 size={size - 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="give"
        options={{
          title: 'Support',
          tabBarIcon: ({ color, size }) => <Heart size={size - 4} color={color} />,
        }}
      />
    </Tabs>
  );
}
