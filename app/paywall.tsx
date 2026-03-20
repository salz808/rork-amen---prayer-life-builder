import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
  Alert,
  Dimensions,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { X, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation } from '@tanstack/react-query';

import { useApp } from '@/providers/AppProvider';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import RadialGlow from '@/components/RadialGlow';

type PurchasesPackage = {
  identifier: string;
  product: {
    identifier: string;
    priceString: string;
  };
};

type PurchasesOffering = {
  identifier: string;
  availablePackages: PurchasesPackage[];
};

const getPurchases = () => {
  try {
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
};

const Purchases = getPurchases();

interface TierInfo {
  id: string;
  emoji: string;
  title: string;
  badge?: string;
  badgeColor?: string;
  check: string;
  price: string;
  period: string;
  desc: string;
  btnStyle: 'outline' | 'amber' | 'moss';
  featured?: boolean;
  pkg?: PurchasesPackage;
  annualPkg?: PurchasesPackage;
}

export default function PaywallScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  const router = useRouter();

  const { state } = useApp();
  const [purchasedTierId, setPurchasedTierId] = React.useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = React.useState<'monthly' | 'annual'>('monthly');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const offeringsQuery = useQuery({
    queryKey: ['offerings'],
    queryFn: async (): Promise<PurchasesOffering | null> => {
      if (!Purchases) {
        console.log('[Paywall] RevenueCat not available');
        return null;
      }
      const offerings = await Purchases.getOfferings();
      return offerings.current ?? null;
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      if (!Purchases) throw new Error('Purchases not available');
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: (_, variables) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Find the tier ID from the package identifier
      const tierId = tiers.find(t => 
        t.pkg?.identifier === variables.identifier || 
        t.annualPkg?.identifier === variables.identifier
      )?.id;
      if (tierId) setPurchasedTierId(tierId);
      else {
        Alert.alert('Your support makes an impact 🙏', "Thank you for walking with us.", [
          { text: 'Amen', onPress: () => router.back() },
        ]);
      }
    },
    onError: (error: unknown) => {
      const err = error as { userCancelled?: boolean; message?: string };
      if (!err.userCancelled) {
        Alert.alert('Something went wrong', 'Please try again.');
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!Purchases) throw new Error('Purchases not available');
      return await Purchases.restorePurchases();
    },
    onSuccess: (customerInfo) => {
      const hasActive = Object.keys(customerInfo.entitlements.active).length > 0;
      if (hasActive) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored!', 'Your support has been restored.', [
          { text: 'Continue', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Nothing to restore', 'No active subscriptions found.');
      }
    },
    onError: () => {
      Alert.alert('Restore failed', 'Please try again later.');
    },
  });

  const packages = offeringsQuery.data?.availablePackages ?? [];

  const tiers: TierInfo[] = [
    {
      id: 'pay_it_forward',
      emoji: '🤍',
      title: 'Pay It Forward',
      check: 'Keep the app free for all',
      price: billingPeriod === 'monthly'
        ? (packages.find(p => p.identifier === 'amen_pay_it_forward')?.product.priceString ?? '$1.99')
        : (packages.find(p => p.identifier === 'amen_pay_it_forward_annual')?.product.priceString ?? '$14.99'),
      period: billingPeriod === 'monthly' ? '/mo' : '/yr',
      desc: 'A small monthly gift to help cover the server and development costs that keep this app free for everyone.',
      btnStyle: 'amber',
      pkg: packages.find(p => p.identifier === 'amen_pay_it_forward'),
      annualPkg: packages.find(p => p.identifier === 'amen_pay_it_forward_annual'),
    },
    {
      id: 'missions',
      emoji: '🌍',
      title: 'Share the Gospel',
      check: '100% to Global Missions',
      price: billingPeriod === 'monthly' 
        ? (packages.find(p => p.identifier === 'amen_missions')?.product.priceString ?? '$4.99')
        : (packages.find(p => p.identifier === 'amen_missions_annual')?.product.priceString ?? '$34.99'),
      period: billingPeriod === 'monthly' ? '/mo' : '/yr',
      desc: 'Every cent of our proceeds from this tier goes directly to global missions sharing the Gospel of Jesus Christ.',
      btnStyle: 'amber',
      featured: true,
      pkg: packages.find(p => p.identifier === 'amen_missions'),
      annualPkg: packages.find(p => p.identifier === 'amen_missions_annual'),
    },
    {
      id: 'partner',
      emoji: '🌱',
      title: 'Kingdom Partner',
      check: 'Development + Missions',
      price: billingPeriod === 'monthly'
        ? (packages.find(p => p.identifier === 'amen_partner')?.product.priceString ?? '$9.99')
        : (packages.find(p => p.identifier === 'amen_partner_annual')?.product.priceString ?? '$74.99'),
      period: billingPeriod === 'monthly' ? '/mo' : '/yr',
      desc: "This tier is for people who want what happened in their prayer life to happen in someone else's. Every cent above costs goes to global missions.",
      btnStyle: 'amber',
      pkg: packages.find(p => p.identifier === 'amen_partner'),
      annualPkg: packages.find(p => p.identifier === 'amen_partner_annual'),
    },
  ];

  const handlePurchase = (tier: TierInfo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const pkg = billingPeriod === 'monthly' ? tier.pkg : (tier.annualPkg ?? tier.pkg);
    if (pkg) {
      purchaseMutation.mutate(pkg);
    } else {
      Alert.alert('Coming Soon', 'Subscriptions will be available when the app launches.');
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[C.background, C.surface, C.background]} style={StyleSheet.absoluteFill} />
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <RadialGlow size={380} maxOpacity={0.07} />
      </View>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.closeBtnRow}>
            <View style={{ flex: 1 }} />
            <Pressable
              style={({ pressed, hovered }: any) => [
                styles.closeBtn,
                (pressed || hovered) && styles.closeBtnHovered,
              ]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="paywall-close"
            >
              <X size={18} color="rgba(244,237,224,0.28)" />
            </Pressable>
          </View>
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>SUPPORT THIS CAUSE</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
              This app is free.{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium, fontSize: T.scale(32) }}>Always will be.</Text>
            </Text>
            <View style={styles.titleRule} />

            <Text style={[styles.mission, { fontFamily: Fonts.italic }]}>
              Your support keeps it alive and helps{' '}
              <Text style={{ color: C.text, fontWeight: '500' as const }}>
                share the Gospel of Jesus Christ with the world.
              </Text>
            </Text>

            <View style={styles.billingToggle}>
              <Pressable 
                onPress={() => setBillingPeriod('monthly')}
                style={[styles.toggleBtn, billingPeriod === 'monthly' && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleText, billingPeriod === 'monthly' && styles.toggleTextActive, { fontFamily: Fonts.titleMedium }]}>Monthly</Text>
              </Pressable>
              <Pressable 
                onPress={() => setBillingPeriod('annual')}
                style={[styles.toggleBtn, billingPeriod === 'annual' && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleText, billingPeriod === 'annual' && styles.toggleTextActive, { fontFamily: Fonts.titleMedium }]}>Annual</Text>
              </Pressable>
            </View>

            {offeringsQuery.isLoading ? (
              <ActivityIndicator color="#C8894A" style={{ marginVertical: 40 }} />
            ) : (
              <View style={styles.tiersContainer}>
                {tiers.map((tier) => (
                  <View
                    key={tier.id}
                    style={[
                      styles.tierCard,
                      tier.featured && styles.tierCardFeatured,
                    ]}
                  >
                    <LinearGradient
                      colors={tier.featured ? ['#2E1C08', '#1E1106'] : ['#271A0A', C.surface]}
                      start={{ x: 0.1, y: 0 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.tierCardInner}
                    >
                      <LinearGradient
                        colors={['transparent', tier.featured ? 'rgba(200,137,74,0.55)' : 'rgba(200,137,74,0.3)', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.tierCardTopLine}
                      />

                      <View style={styles.tierTop}>
                        <View style={[
                          styles.tierIco,
                          tier.featured && styles.tierIcoWarm,
                          tier.badgeColor === 'moss' && styles.tierIcoMoss,
                        ]}>
                          <Text style={styles.tierEmojiText}>{tier.emoji}</Text>
                        </View>
                        <View style={styles.tierNameWrap}>
                          <View style={styles.tierNameRow}>
                            <Text style={[styles.tierName, { fontFamily: Fonts.titleSemiBold }]}>{tier.title}</Text>
                            {tier.badge && (
                              <View style={[
                                styles.tierBadge,
                                tier.badgeColor === 'moss' && styles.tierBadgeMoss,
                              ]}>
                                <Text style={[
                                  styles.tierBadgeText,
                                  tier.badgeColor === 'moss' && { color: '#8ED09A' },
                                ]}>{tier.badge}</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.tierCheckRow}>
                            <Text style={[styles.tierCheck, { fontFamily: Fonts.italic }]}>✓ {tier.check}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.tierPriceRow}>
                        <Text style={[styles.tierPrice, { fontFamily: Fonts.titleLight }]}>{tier.price}</Text>
                        <Text style={[styles.tierPeriod, { fontFamily: Fonts.titleLight }]}>{tier.period}</Text>
                        {billingPeriod === 'annual' && (
                          <View style={styles.savingsBadge}>
                            <Text style={[styles.savingsText, { fontFamily: Fonts.titleBold }]}>
                              SAVE {tier.id === 'pay_it_forward' ? '37%' : tier.id === 'missions' ? '41%' : '37%'}
                            </Text>
                          </View>
                        )}
                      </View>

                       <Text style={[styles.tierDesc, { fontFamily: Fonts.serifRegular }]}>{tier.desc}</Text>

                      {purchasedTierId === tier.id || (state.isSubscriber && state.entitlements.some(e => e.includes(tier.id) || tier.id.includes(e))) ? (
                        <View style={styles.thankYouSection}>
                          <Text style={styles.thankYouEmoji}>🙏</Text>
                          <Text style={[styles.thankYouTitle, { fontFamily: Fonts.titleSemiBold }]}>Thank you.</Text>
                          <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular }]}>
                            You just became part of something bigger than an app. Your support keeps Amen free for the person who needs it most and can't pay for it — and sends the Gospel somewhere it hasn't been yet.
                          </Text>
                          <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular, marginTop: 12 }]}>
                            We don't take that lightly.
                          </Text>
                          <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular, marginTop: 12 }]}>
                            You'll receive a monthly update on where your partnership is going.
                          </Text>
                          <Pressable 
                            style={styles.doneBtn}
                            onPress={() => router.back()}
                          >
                            <Text style={[styles.doneBtnText, { fontFamily: Fonts.titleBold }]}>AMEN</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          style={({ pressed, hovered }: any) => [
                            styles.tierBtn,
                            tier.btnStyle === 'outline' && { borderWidth: 1, borderColor: 'rgba(200,137,74,0.3)', backgroundColor: 'transparent' },
                            (pressed || hovered) && styles.tierBtnHovered,
                          ]}
                          onPress={() => handlePurchase(tier)}
                          disabled={purchaseMutation.isPending || restoreMutation.isPending}
                          testID={`purchase-${tier.id}`}
                        >
                          <LinearGradient
                            colors={[C.accent, C.accentDeep]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.tierBtnGradient}
                          >
                            <Text style={[styles.tierBtnText, { color: '#fff' }]}>
                              {purchaseMutation.isPending ? 'Processing...' : 'Subscribe →'}
                            </Text>
                          </LinearGradient>
                        </Pressable>
                      )}
                    </LinearGradient>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.footerNote}>
                <Text style={[styles.footerNoteText, { fontFamily: Fonts.italic }]}>
                  No investors. No ads. Every dollar goes directly to app development or global missions. Just people who pray, supporting people who pray.
                </Text>
            </View>

            <Pressable
              style={({ pressed, hovered }: any) => [
                styles.restoreBtn,
                (pressed || hovered) && styles.restoreBtnHovered,
              ]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                restoreMutation.mutate();
              }}
              disabled={purchaseMutation.isPending || restoreMutation.isPending}
              testID="restore-purchases"
            >
              {restoreMutation.isPending ? (
                <ActivityIndicator color="rgba(244,237,224,0.28)" size="small" />
              ) : (
                <>
                  <RefreshCw size={13} color="rgba(244,237,224,0.28)" />
                  <Text style={[styles.restoreText, { fontFamily: Fonts.titleRegular }]}>Restore purchases</Text>
                </>
              )}
            </Pressable>

            <Text style={[styles.legal, { fontFamily: Fonts.titleLight }]}>
              Subscriptions renew monthly. Cancel anytime in your device settings.
            </Text>

            <View style={styles.legalLinks}>
              <Pressable onPress={() => Linking.openURL('https://iammadewhole.com/privacy')}>
                <Text style={[styles.legalLinkText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>Privacy Policy</Text>
              </Pressable>
              <View style={[styles.legalDot, { backgroundColor: C.textMuted }]} />
              <Pressable onPress={() => Linking.openURL('https://iammadewhole.com/terms')}>
                <Text style={[styles.legalLinkText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>Terms of Use</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  safeArea: {
    flex: 1,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: -80,
    left: Math.round(Dimensions.get('window').width / 2) - 190,
  },
  closeBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.overlayLight,
  },
  closeBtnHovered: {
    backgroundColor: 'rgba(200,137,74,0.14)',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 12,
    paddingBottom: 40,
  },
  content: {},
  eyebrow: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: T.scale(34),
    lineHeight: 40,
    letterSpacing: -0.5,
    color: C.text,
    marginBottom: 12,
  },
  titleRule: {
    width: 44,
    height: 1.5,
    backgroundColor: C.accent,
    opacity: 0.55,
    marginBottom: 18,
  },
  mission: {
    fontSize: T.scale(17),
    lineHeight: 30,
    color: C.textSecondary,
    marginBottom: 24,
  },
  tiersContainer: {
    gap: 14,
    marginBottom: 20,
  },
  tierCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
    alignSelf: 'center',
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
  },
  toggleBtnActive: {
    backgroundColor: C.accent,
  },
  toggleText: {
    fontSize: T.scale(12),
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toggleTextActive: {
    color: '#FFF',
  },
  thankYouSection: {
    backgroundColor: 'rgba(200,137,74,0.08)',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
  },
  thankYouEmoji: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  thankYouTitle: {
    fontSize: T.scale(18),
    color: C.accentDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  thankYouText: {
    fontSize: T.scale(14),
    lineHeight: 22,
    color: C.text,
    textAlign: 'center',
  },
  doneBtn: {
    marginTop: 20,
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFF',
    fontSize: T.scale(13),
    letterSpacing: 1,
  },
  tierCardFeatured: {
    borderColor: 'rgba(200,137,74,0.45)',
  },
  tierCardInner: {
    padding: 24,
    position: 'relative',
  },
  tierCardTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  tierTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  tierIco: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(200,137,74,0.1)',
    borderColor: 'rgba(200,137,74,0.18)',
  },
  tierIcoWarm: {
    backgroundColor: 'rgba(200,137,74,0.18)',
    borderColor: 'rgba(200,137,74,0.35)',
  },
  tierIcoMoss: {
    backgroundColor: 'rgba(62,130,80,0.18)',
    borderColor: 'rgba(62,130,80,0.32)',
  },
  tierEmojiText: {
    fontSize: T.scale(20),
  },
  tierNameWrap: {
    flex: 1,
  },
  tierNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  tierName: {
    fontSize: T.scale(13),
    letterSpacing: 0.3,
    color: C.text,
  },
  tierBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
    backgroundColor: 'rgba(200,137,74,0.18)',
    borderColor: 'rgba(200,137,74,0.35)',
  },
  tierBadgeMoss: {
    backgroundColor: 'rgba(62,130,80,0.18)',
    borderColor: 'rgba(62,130,80,0.38)',
  },
  tierBadgeText: {
    fontSize: T.scale(8),
    letterSpacing: 2,
    color: C.accentDark,
  },
  tierCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tierCheck: {
    fontSize: T.scale(13),
    color: 'rgba(200,137,74,0.7)',
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginBottom: 4,
  },
  tierPrice: {
    fontSize: T.scale(46),
    letterSpacing: -1.5,
    lineHeight: 50,
    color: C.text,
  },
  tierPeriod: {
    fontSize: T.scale(18),
    color: C.textSecondary,
    marginRight: 8,
  },
  savingsBadge: {
    backgroundColor: 'rgba(62,130,80,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62,130,80,0.25)',
  },
  savingsText: {
    fontSize: T.scale(10),
    color: '#8ED09A',
    letterSpacing: 0.5,
  },
  tierDesc: {
    fontSize: T.scale(15),
    lineHeight: 26,
    marginBottom: 18,
    color: C.textSecondary,
  },
  tierBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  tierBtnHovered: {
    opacity: 0.88,
  },
  tierBtnGradient: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tierBtnText: {
    fontSize: T.scale(12),
    fontWeight: '500' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  footerNote: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.35)',
    backgroundColor: 'rgba(200,137,74,0.1)',
    padding: 22,
    overflow: 'hidden',
    marginBottom: 20,
  },
  footerNoteText: {
    fontSize: T.scale(16),
    lineHeight: 28,
    textAlign: 'center' as const,
    color: 'rgba(230,190,150,0.9)',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 12,
  },
  restoreBtnHovered: {
    opacity: 0.65,
  },
  restoreText: {
    fontSize: T.scale(13),
    color: C.textMuted,
  },
  legal: {
    fontSize: T.scale(9),
    textAlign: 'center' as const,
    lineHeight: 16,
    letterSpacing: 0.5,
    color: C.textMuted,
    marginBottom: 12,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 40,
  },
  legalLinkText: {
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  legalDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.3,
  },
});
