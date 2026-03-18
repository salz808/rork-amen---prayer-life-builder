import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { Fonts } from '@/constants/fonts';
import RadialGlow from '@/components/RadialGlow';
import { Chrome as Google, Mail } from 'lucide-react-native';
import GlowButton from '@/components/GlowButton';

const { width } = Dimensions.get('window');

export default function AuthScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });

        if (error) throw error;
        
        // Success handled by AppProvider onAuthStateChange
        router.replace('/');
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        console.error('Apple Sign In Error', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'rork-app://auth/callback',
        },
      });

      if (error) throw error;
      
      // Note: Full OAuth flow requires a native redirect.
      // In development builds, this works with deep links.
    } catch (e) {
      console.error('Google Sign In Error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <LinearGradient
          colors={['#0D0804', '#1A1006', '#0D0804']}
          style={StyleSheet.absoluteFill}
        />
        
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.glowWrap}>
            <RadialGlow size={400} maxOpacity={0.15} />
          </View>

          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={[styles.brand, { fontFamily: Fonts.titleExtraLight }]}>Amen</Text>
              <LinearGradient
                colors={['transparent', 'rgba(200,137,74,0.6)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.brandRule}
              />
              <Text style={[styles.tagline, { fontFamily: Fonts.italic }]}>
                God is <Text style={[styles.accent, { fontFamily: Fonts.italicSemiBold }]}>much closer</Text> than you think.
              </Text>
            </View>

            <View style={styles.authBox}>
              <Text style={[styles.boxTitle, { fontFamily: Fonts.titleMedium }]}>SAVE YOUR PROGRESS</Text>
              <Text style={[styles.boxDesc, { fontFamily: Fonts.serifRegular }]}>
                Connect an account to sync your 30-day journey across devices and unlock community features.
              </Text>

              <View style={styles.actions}>
                <GlowButton
                  label="SIGN IN WITH APPLE"
                  onPress={handleAppleSignIn}
                  variant="primary"
                  gradient={['#F4EDE0', '#DED6C8']}
                  disabled={loading}
                  icon={<Text style={{ fontSize: 18, color: '#0D0804' }}></Text>}
                  glowColor={{ r: 244, g: 237, b: 224 }}
                  style={{ width: '100%' }}
                />

                <GlowButton
                  label="SIGN IN WITH GOOGLE"
                  onPress={handleGoogleSignIn}
                  variant="ghost"
                  disabled={loading}
                  icon={<Google size={18} color="#F4EDE0" />}
                  style={{ width: '100%' }}
                  textStyle={{ color: '#F4EDE0' }}
                />

                <Pressable
                  style={({ pressed }) => [styles.skipBtn, pressed && styles.skipBtnPressed]}
                  onPress={() => router.replace('/')}
                >
                  <Text style={[styles.skipText, { fontFamily: Fonts.titleRegular }]}>Maybe later</Text>
                  <Text style={[styles.skipNote, { fontFamily: Fonts.titleRegular }]}>Your progress is saved on this device</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={[styles.footerText, { fontFamily: Fonts.serifRegular }]}>
                By signing in, you agree to our Terms of Service & Privacy Policy.
              </Text>
            </View>
          </View>

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#C8894A" size="large" />
            </View>
          )}
        </SafeAreaView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0804',
  },
  safeArea: {
    flex: 1,
  },
  glowWrap: {
    position: 'absolute',
    top: -100,
    alignSelf: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  brand: {
    fontSize: 72,
    letterSpacing: 10,
    color: '#F4EDE0',
    marginBottom: 8,
  },
  brandRule: {
    width: 140,
    height: 1,
    marginTop: 2,
    marginBottom: 20,
  },
  tagline: {
    fontSize: 18,
    color: 'rgba(244,237,224,0.6)',
    textAlign: 'center',
  },
  accent: {
    color: '#C8894A',
  },
  authBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 32,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
  },
  boxTitle: {
    fontSize: 10,
    letterSpacing: 4,
    color: '#C8894A',
    textAlign: 'center',
    marginBottom: 16,
  },
  boxDesc: {
    fontSize: 17,
    lineHeight: 26,
    color: 'rgba(244,237,224,0.8)',
    textAlign: 'center',
    marginBottom: 32,
  },
  actions: {
    gap: 16,
  },
  appleBtn: {
    backgroundColor: '#F4EDE0',
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleBtnText: {
    color: '#0D0804',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  googleBtn: {
    backgroundColor: 'rgba(244,237,224,0.08)',
    height: 58,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(244,237,224,0.15)',
  },
  googleBtnText: {
    color: '#F4EDE0',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  skipBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    color: 'rgba(244,237,224,0.4)',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  skipBtnPressed: {
    opacity: 0.6,
  },
  skipNote: {
    color: 'rgba(244,237,224,0.25)',
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  btnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(244,237,224,0.3)',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,8,4,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
