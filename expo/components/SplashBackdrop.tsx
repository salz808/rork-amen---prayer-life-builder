// SplashBackdrop — the shared splash background (2026-11-17,
// Worker B): BackgroundGradient (default DarkColors triple) + the
// two ambient veils, from the single source of truth in
// lib/splashSpec.ts. The launch splash (BootScreen) and the
// onboarding splash step render this same component, so the
// background cannot drift between them: before this, the launch
// screen had no veils at all while onboarding had themed ones, and
// the gradients were resolved two different ways. No children, no
// props — the backdrop is identical on both screens by construction.
// Pointer-events none throughout: the launch overlay's tap-to-skip
// Pressable and onboarding's LET'S BEGIN both sit above it.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import BackgroundGradient from '@/components/BackgroundGradient';
import { SPLASH_VEIL_BOTTOM, SPLASH_VEIL_TOP } from '@/lib/splashSpec';

export default function SplashBackdrop() {
  return (
    <>
      <BackgroundGradient style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={SPLASH_VEIL_TOP} />
      <View pointerEvents="none" style={SPLASH_VEIL_BOTTOM} />
    </>
  );
}
