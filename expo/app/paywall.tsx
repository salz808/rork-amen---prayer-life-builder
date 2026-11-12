import React, { useEffect, useState } from 'react';
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
import Constants from 'expo-constants';
import { X, RefreshCw, LogIn } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation } from '@tanstack/react-query';

import { useApp } from '@/providers/AppProvider';
import { UserTier } from '@/types';
import { useScreenProtection } from '@/hooks/useScreenProtection';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import RadialGlow from '@/components/RadialGlow';
import { getAnnualTrialLabel } from '@/lib/purchasesTrial';

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
  check: string;
  price: string;
  period: string;
  desc: string;
  benefits: string[];
  cta: string;
  btnStyle: 'outline' | 'amber';
  featured?: boolean;
  annualCallout: 'save' | 'best';
  annualSavings: string;
  trialLabel?: string | null;
  pkg?: PurchasesPackage;
  annualPkg?: PurchasesPackage;
}

const PRODUCT_IDS = {
  // Single Partner tier — these store products carry the $4.99 / $39.99 prices.
  partnerMonthly: 'triad_missions_monthly',
  partnerAnnual: 'triad_missions_annual',
} as const;

function findPackage(packages: PurchasesPackage[], productId: string): PurchasesPackage | undefined {
  return packages.find((pkg) => pkg.product.identifier === productId || pkg.identifier === productId);
}

function SocialProof() {
  const C = useColors();
  const T = useTypography();
  return (
    <View style={{ marginBottom: 22, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(200,137,74,0.22)', backgroundColor: 'rgba(200,137,74,0.06)' }}>
      <Text style={{ fontSize: T.size.body, lineHeight: T.leading.body, color: C.textSecondary, fontFamily: Fonts.serifRegular, textAlign: 'center' }}>
        Your support keeps guided prayer open for everyone.
      </Text>
    </View>
  );
}

export default function PaywallScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  useScreenProtection(true, 'paywall-screen');

  const router = useRouter();

  const { state, syncSubscription, setSubscribedSinceMonthly } = useApp();
  const [purchasedTierId, setPurchasedTierId] = React.useState<string | null>(null);
  // Round-5 lane 2, H-1: Annual is the default so the trial plan is visible
  // on first view instead of hiding behind the toggle.
  const [billingPeriod, setBillingPeriod] = React.useState<'monthly' | 'annual'>('annual');
  const fadeAnim = useState(() => new Animated.Value(0))[0]
  const slideAnim = useState(() => new Animated.Value(30))[0]

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Finding 38: same honest-Expo-Go handling as the Give tab — in Expo
  // Go the RevenueCat native module is absent, so getOfferings() always
  // throws and a RETRY could never succeed. Detect the preview, skip
  // the fetch, and say so honestly instead. Real prices load in the
  // App Store build.
  const isExpoGo = Constants.appOwnership === 'expo';

  const offeringsQuery = useQuery({
    queryKey: ['offerings'],
    queryFn: async (): Promise<PurchasesOffering | null> => {
      if (isExpoGo) {
        if (__DEV__) {
          console.log('[Paywall] Expo Go preview — store unavailable, skipping offerings');
        }
        return null;
      }
      if (!Purchases) {
        if (__DEV__) {
          console.log('[Paywall] RevenueCat not available');
        }
        return null;
      }
      const offerings = await Purchases.getOfferings();
      return offerings.current ?? null;
    },
    retry: false,
  });

  const purchaseMutation = useMutation({
    mutationFn: async ({ pkg }: { pkg: PurchasesPackage; period: 'monthly' | 'annual' }) => {
      if (!Purchases) throw new Error('Purchases not available');
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return { customerInfo, pkg };
    },
    onSuccess: ({ customerInfo, pkg: purchasedPkg }, { period }) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const activeEntitlements = Object.keys(customerInfo.entitlements.active);
      syncSubscription(activeEntitlements);
      // Track when the user started on a monthly plan to drive the annual upsell after ~90 days.
      // The period is captured at purchase time (mutation variables), not
      // read from toggle state here — the toggle can change while the
      // Apple sheet is open, which used to misattribute the purchase.
      const isMonthlyPurchase = period === 'monthly';
      if (isMonthlyPurchase) {
        if (!state.subscribedSinceMonthly) {
          setSubscribedSinceMonthly(new Date().toISOString());
        }
      } else {
        // Switched to annual — clear the monthly start marker so we don't keep nudging.
        setSubscribedSinceMonthly(null);
      }
      const tierId = tiers.find(t => 
        t.pkg?.identifier === purchasedPkg.identifier || 
        t.annualPkg?.identifier === purchasedPkg.identifier
      )?.id;
      // Thank-you keys off the GRANTED entitlement, not the package-id
      // match: a purchase that grants an entitlement shows the thank-you
      // even if the package identifier does not match a tier card (the
      // old code dropped those buyers to a generic alert instead).
      if (activeEntitlements.length > 0) {
        setPurchasedTierId(tierId ?? 'partner');
      } else {
        Alert.alert('Your kindness makes a real difference 🙏', "Thank you for walking with us.", [
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
      const activeEntitlements = Object.keys(customerInfo.entitlements.active);
      const hasActive = activeEntitlements.length > 0;
      if (hasActive) {
        syncSubscription(activeEntitlements);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Welcome back. Your Partner access is restored.', undefined, [
          { text: 'Continue', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Nothing to restore', "We couldn't find a past subscription on this store account. If you subscribed with a different Apple ID or Google account, sign in with that one and try again.");
      }
    },
    onError: () => {
      Alert.alert('Restore failed', "Restore didn't work right now. Check your connection and try again. Your existing purchases are unaffected.");
    },
  });

  const packages = offeringsQuery.data?.availablePackages ?? [];

  const tiers: TierInfo[] = [
    {
      id: 'partner',
      emoji: '🌱',
      title: 'Partner',
      check: 'All in. Both directions.',
      price: billingPeriod === 'monthly'
        ? (findPackage(packages, PRODUCT_IDS.partnerMonthly)?.product.priceString ?? '$4.99')
        : (findPackage(packages, PRODUCT_IDS.partnerAnnual)?.product.priceString ?? '$39.99'),
      period: billingPeriod === 'monthly' ? '/mo' : '/yr',
      // Kai-approved 2026-10-26 (bundle 19, Partner definition):
      // "Partner" is the paid support tier — say so plainly, instead
      // of assuming a newcomer knows what the word means here.
      desc: 'A monthly or yearly gift that opens everything below.',
      benefits: [
        // Round-5 lane 2, H-4: journeys are gated by Foundations completion,
        // not by payment — the benefit must not promise a Partner subscriber
        // every journey on day one.
        'The full Prayer Library. Revisit every day you have reached.',
        'All 4 soundscapes, spoken narration & sleep mode',
        'The Monastic theme',
      ],
      cta: 'Become a Partner →',
      btnStyle: 'amber',
      featured: true,
      annualCallout: 'best',
      annualSavings: '33%',
      pkg: findPackage(packages, PRODUCT_IDS.partnerMonthly),
      annualPkg: findPackage(packages, PRODUCT_IDS.partnerAnnual),
    },
  ];

  // Surface the store's introductory free trial on annual plans (decided: 7-day free trial, annual only).
  const hasStoreData = packages.length > 0;
  const tiersWithTrial = tiers.map((tier) => ({
    ...tier,
    trialLabel: billingPeriod === 'annual' ? getAnnualTrialLabel(tier.annualPkg, hasStoreData) : null,
  }));
  // Audit round 3, J-S22: the legal line derives its trial wording from
  // the store's live introductory offer instead of hardcoding "7-day" —
  // if the store ever changes or drops the trial, the legal line follows
  // instead of promising a trial that no longer exists. Batch pass: no
  // store data (or no trial) means NO trial sentence at all — the line
  // omits the trial and charge-timing claims entirely rather than
  // softening to an unconfirmed "a free trial".
  const annualTrialLabel = tiersWithTrial[0]?.trialLabel ?? null;
  const annualTrialPhrase: string | null = annualTrialLabel === 'FREE TRIAL'
    ? 'a free trial'
    : (annualTrialLabel?.toLowerCase() ?? null);
  // (The trial badge on the annual card and the legal line below both
  // derive from the store's live offer — see getAnnualTrialLabel.)

  const handleOpenLegal = (url: string) => {
    void Linking.openURL(url).catch(() => {
      Alert.alert('Couldn’t open that page', 'Check your connection and try again.');
    });
  };

  const handlePurchase = (tier: TierInfo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Finding 38: no store in this preview — say so instead of
    // showing "Plan unavailable" for a plan that simply can't load.
    if (isExpoGo) {
      Alert.alert(
        'Purchases aren’t available in this preview',
        'The App Store isn’t connected here, so purchases can’t load. Partner works in the App Store build.',
      );
      return;
    }
    const pkg = billingPeriod === 'monthly' ? tier.pkg : tier.annualPkg;
    if (pkg) {
      purchaseMutation.mutate({ pkg, period: billingPeriod });
    } else {
      Alert.alert('Plan unavailable', 'This plan could not be loaded from the store. Please check your connection and try again.');
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
              <X size={18} color="rgba(244,237,224,0.6)" />
            </Pressable>
          </View>
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>SUPPORT THIS CAUSE</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifMedium }]}>Free for everyone.</Text>
            {/* Finding 37: matches the Give tab headline. Finding 39:
                the mission is one line now — the plan cards below
                carry what Partner unlocks. */}
            <Text style={[styles.mission, { fontFamily: Fonts.italic }]}>
              Your daily prayer journey is free for everyone.
            </Text>
            <View style={styles.titleRule} />

            <SocialProof />

            {/* Finding 39: the standalone trial callout is cut — the
                FREE TRIAL badge on the annual card plus the legal line
                below already carry the trial, so this was a third copy
                of the same fact. */}
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
            ) : isExpoGo ? (
              // Finding 38: honest preview note — no error, no dead RETRY.
              <View style={{ marginVertical: 24, paddingHorizontal: 16, alignItems: 'center' }} testID="paywall-expo-go-note">
                <Text style={{ fontSize: T.size.body, lineHeight: T.leading.body, color: C.text, fontFamily: Fonts.serifRegular, textAlign: 'center' }}>
                  Subscriptions can&apos;t load in this preview. The App Store isn&apos;t connected here.
                </Text>
              </View>
            ) : offeringsQuery.isError ? (
              <View style={{ marginVertical: 24, paddingHorizontal: 16, alignItems: 'center' }}>
                <Text style={{ fontSize: T.size.body, lineHeight: T.leading.body, color: C.text, fontFamily: Fonts.serifRegular, textAlign: 'center' }}>
                  Subscription options couldn’t load. Check your connection and try again. Your existing purchases are unaffected, and Restore below still works.
                </Text>
                <Pressable
                  onPress={() => void offeringsQuery.refetch()}
                  style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, minHeight: 44, justifyContent: 'center', borderRadius: 100, borderWidth: 1, borderColor: 'rgba(200,137,74,0.4)' }}
                >
                  <Text style={{ fontSize: T.size.button, lineHeight: T.leading.button, letterSpacing: 1.5, color: C.accentDark, fontFamily: Fonts.titleBold }}>RETRY</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.tiersContainer}>
                {tiersWithTrial.map((tier) => (
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
                                                  ]}>
                          <Text style={styles.tierEmojiText}>{tier.emoji}</Text>
                        </View>
                        <View style={styles.tierNameWrap}>
                          <View style={styles.tierNameRow}>
                            <Text style={[styles.tierName, { fontFamily: Fonts.titleSemiBold }]}>{tier.title}</Text>
                          </View>
                          <View style={styles.tierCheckRow}>
                            <Text style={[styles.tierCheck, { fontFamily: Fonts.italic }]}>✓ {tier.check}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.tierPriceRow}>
                        <Text style={[styles.tierPrice, { fontFamily: Fonts.titleMedium }]}>{tier.price}</Text>
                        <Text style={[styles.tierPeriod, { fontFamily: Fonts.titleLight }]}>{tier.period}</Text>
                        {billingPeriod === 'annual' && (
                          <View style={[styles.savingsBadge, tier.annualCallout === 'best' && styles.savingsBadgeBest]}>
                            <Text style={[
                              styles.savingsText,
                              tier.annualCallout === 'best' && styles.savingsTextBest,
                              { fontFamily: Fonts.titleBold },
                            ]}>
                              {/* Round-5 lane 2, H-2: keep BEST VALUE and add
                                  the saving number beside it. */}
                              {tier.annualCallout === 'best' ? `BEST VALUE · SAVE ${tier.annualSavings} VS MONTHLY` : `SAVE ${tier.annualSavings}`}
                            </Text>
                          </View>
                        )}
                      </View>

                      {billingPeriod === 'annual' && tier.trialLabel && (
                        <View style={styles.trialBadge}>
                          <Text style={[styles.trialBadgeText, { fontFamily: Fonts.titleBold }]}>
                            {tier.trialLabel}
                          </Text>
                        </View>
                      )}

                       <Text style={[styles.tierDesc, { fontFamily: Fonts.serifRegular }]}>{tier.desc}</Text>
                      <View style={styles.tierBenefits}>
                        {tier.benefits.map((benefit) => (
                          <View key={benefit} style={styles.tierBenefitRow}>
                            <Text style={[styles.tierBenefitCheck, { fontFamily: Fonts.titleBold }]}>✓</Text>
                            <Text style={[styles.tierBenefitText, { fontFamily: Fonts.titleRegular }]}>{benefit}</Text>
                          </View>
                        ))}
                      </View>

                      {purchasedTierId === tier.id || (state.isSubscriber && state.tierLevel >= UserTier.PARTNER) ? (
                        <View style={styles.thankYouSection}>
                          <Text style={styles.thankYouEmoji}>🙏</Text>
                          <Text style={[styles.thankYouTitle, { fontFamily: Fonts.titleSemiBold }]}>Thank you.</Text>
                          <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular }]}>
                            You are now part of something bigger than an app. Your support keeps TRIAD Prayer free for someone who needs it most and cannot pay. And it sends the Gospel to a place it has not reached yet.
                          </Text>
                          <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular, marginTop: 12 }]}>
                            We don&apos;t take that lightly.
                          </Text>
                          <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular, marginTop: 12 }]}>
                            Thank you for carrying this mission with us.
                          </Text>
                          <Pressable 
                            style={styles.doneBtn}
                            onPress={() => router.back()}
                          >
                            <Text style={[styles.doneBtnText, { fontFamily: Fonts.titleBold }]}>DONE</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          style={({ pressed, hovered }: any) => [
                            styles.tierBtn,
                            tier.btnStyle === 'outline' && { borderWidth: 1, borderColor: 'rgba(200,137,74,0.3)' },
                            (pressed || hovered) && styles.tierBtnHovered,
                          ]}
                          onPress={() => handlePurchase(tier)}
                          disabled={purchaseMutation.isPending || restoreMutation.isPending}
                          testID={`purchase-${tier.id}`}
                          // Audit round 3, S6: a VoiceOver user heard only
                          // "Become a Partner" with no price, period, or
                          // trial — the facts a sighted user sees in the
                          // same card. Built from the card's own values.
                          accessibilityRole="button"
                          accessibilityLabel={`${tier.cta.replace(' →', '')}, ${tier.price} per ${tier.period === '/mo' ? 'month' : 'year'}${tier.trialLabel ? `, ${tier.trialLabel}` : ''}`}
                        >
                          <LinearGradient
                            colors={
                              tier.btnStyle === 'outline'
                                ? ['rgba(200,137,74,0.06)', 'rgba(200,137,74,0.12)']
                                : [C.accent, C.accentDeep]
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.tierBtnGradient}
                          >
                            <Text style={[
                              styles.tierBtnText, 
                              // H18: dark text on the amber gradient (7.28:1),
                              // not white (2.94:1 at the gradient start).
                              // Amber itself is NOT lightened.
                              tier.btnStyle === 'outline' ? { color: C.accentDark } : { color: '#0D0804' }
                            ]}>
                              {purchaseMutation.isPending ? 'Processing...' : tier.cta}
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
                  No investors. No ads. No agenda.{'\n'}Just people who pray, funding people who need to hear about Jesus.
                </Text>
            </View>

            {/* Steal B — "Already a Partner?" split: two paths back to
                Partner access (sign in vs store restore) instead of one
                vague link. Restore still reuses restoreMutation; only
                the UI and alert copy changed.
                Pro-pass A1: hidden for current Partners — a subscriber
                already sees "Thank you" above and must never be asked
                to get their access back. */}
            {!(state.isSubscriber && state.tierLevel >= UserTier.PARTNER) ? (
            <View style={styles.partnerCard}>
              <Text style={[styles.partnerHeading, { fontFamily: Fonts.titleSemiBold }]}>Already a Partner?</Text>
              {/* Finding 39: one short line — the two buttons below say
                  the rest. */}
              <Text style={[styles.partnerSub, { fontFamily: Fonts.titleRegular }]}>Subscribed before? Get your access back. No need to pay twice.</Text>
              <Pressable
                style={({ pressed, hovered }: any) => [
                  styles.partnerBtn,
                  (pressed || hovered) && styles.partnerBtnHovered,
                ]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/auth');
                }}
                testID="already-partner-sign-in"
                accessibilityRole="button"
                accessibilityLabel="Sign in: I have a TRIAD account, Apple, Google, or email"
              >
                <View style={styles.partnerBtnTitleRow}>
                  <LogIn size={14} color={C.textSecondary} />
                  <Text style={[styles.partnerBtnTitle, { fontFamily: Fonts.titleSemiBold }]}>Sign in</Text>
                </View>
                <Text style={[styles.partnerBtnSub, { fontFamily: Fonts.titleRegular }]}>Apple, Google, or email sign-in</Text>
              </Pressable>
              <View style={styles.partnerDivider} />
              <Pressable
                style={({ pressed, hovered }: any) => [
                  styles.partnerBtn,
                  (pressed || hovered) && styles.partnerBtnHovered,
                ]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  // Finding 38: no store in this preview — Restore
                  // can't reach the App Store here either.
                  if (isExpoGo) {
                    Alert.alert(
                      'Restore isn’t available in this preview',
                      'The App Store isn’t connected here. Restore works in the App Store build.',
                    );
                    return;
                  }
                  restoreMutation.mutate();
                }}
                disabled={purchaseMutation.isPending || restoreMutation.isPending}
                testID="restore-purchases"
                accessibilityRole="button"
                accessibilityLabel="Restore purchases: I subscribed in the App Store or Google Play"
              >
                {restoreMutation.isPending ? (
                  <ActivityIndicator color={C.textSecondary} size="small" />
                ) : (
                  <>
                    <View style={styles.partnerBtnTitleRow}>
                      <RefreshCw size={14} color={C.textSecondary} />
                      <Text style={[styles.partnerBtnTitle, { fontFamily: Fonts.titleSemiBold }]}>Restore purchases</Text>
                    </View>
                    <Text style={[styles.partnerBtnSub, { fontFamily: Fonts.titleRegular }]}>Subscribed in the App Store or Google Play</Text>
                  </>
                )}
              </Pressable>
            </View>
            ) : null}

            {/* Round-5 lane 2, H-1: the legal line is scoped to the selected
                period — the annual-trial sentence must never sit under Monthly. */}
            {/* Finding 39: fine print trimmed to the facts — trial,
                price, renew, cancel. The store-derived trial wording
                (J-S22) is unchanged. */}
            <Text style={[styles.legal, { fontFamily: Fonts.titleLight }]}>
              {billingPeriod === 'annual'
                ? (annualTrialPhrase
                  ? `Annual starts with ${annualTrialPhrase} where available, then ${findPackage(packages, PRODUCT_IDS.partnerAnnual)?.product.priceString ?? '$39.99'}/year unless cancelled. Renews automatically; cancel anytime in App Store settings.`
                  : `Annual is ${findPackage(packages, PRODUCT_IDS.partnerAnnual)?.product.priceString ?? '$39.99'}/year unless cancelled. Renews automatically; cancel anytime in App Store settings.`)
                : 'Monthly renews automatically; cancel anytime in App Store settings.'}
            </Text>

            <View style={styles.legalLinks}>
              <Pressable onPress={() => handleOpenLegal('https://tearsandoil.com/triadprivacy')} style={styles.legalLinkBtn}>
                <Text style={[styles.legalLinkText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>Privacy Policy</Text>
              </Pressable>
              <View style={[styles.legalDot, { backgroundColor: C.textMuted }]} />
              <Pressable onPress={() => handleOpenLegal('https://tearsandoil.com/triadterms')} style={styles.legalLinkBtn}>
                <Text style={[styles.legalLinkText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>Terms of Use</Text>
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginBottom: 24,
  },
  tiersContainer: {
    gap: 14,
    marginBottom: 24,
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
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: C.accent,
  },
  toggleText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.scale(21),
    textAlign: 'center',
    marginBottom: 8,
  },
  thankYouTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.accentDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  thankYouText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 0.3,
    color: C.text,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    backgroundColor: 'rgba(200,137,74,0.18)',
    borderColor: 'rgba(200,137,74,0.35)',
  },
  tierBadgeText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    color: C.accentDark,
  },
  tierCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tierCheck: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginBottom: 4,
  },
  tierPrice: {
    fontSize: T.size.display,
    letterSpacing: -1.5,
    lineHeight: T.leading.display,
    color: C.text,
  },
  tierPeriod: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginRight: 8,
  },
  savingsBadge: {
    backgroundColor: 'rgba(200,137,74,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.25)',
  },
  savingsBadgeBest: {
    backgroundColor: 'rgba(200,137,74,0.16)',
    borderColor: 'rgba(200,137,74,0.34)',
  },
  savingsText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  savingsTextBest: {
    color: C.accentDark,
  },
  trialBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,137,74,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  trialBadgeText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  tierDesc: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    marginBottom: 14,
    color: C.textSecondary,
  },
  tierBenefits: {
    gap: 8,
    marginBottom: 18,
  },
  tierBenefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tierBenefitCheck: {
    fontSize: T.scale(14.5),
    color: C.accentDark,
    marginTop: 2,
  },
  tierBenefitText: {
    flex: 1,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tierBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
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
    marginBottom: 32,
  },
  footerNoteText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center' as const,
    color: 'rgba(230,190,150,0.9)',
  },
  // Steal B — "Already a Partner?" card: the restore entry point split
  // into sign-in vs store restore. Amber-tinted like footerNote above.
  partnerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.35)',
    backgroundColor: 'rgba(200,137,74,0.08)',
    padding: 18,
    marginBottom: 24,
  },
  partnerHeading: {
    // Finding 40: section-title size, not display — the heading is
    // a card title, not a screen title.
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    textAlign: 'center' as const,
    color: C.text,
    marginBottom: 6,
  },
  partnerSub: {
    // Finding 40: sub-lines are one body size.
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center' as const,
    color: C.textSecondary,
    marginBottom: 14,
  },
  partnerBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    backgroundColor: 'rgba(200,137,74,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  partnerBtnHovered: {
    opacity: 0.88,
  },
  partnerBtnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  partnerBtnTitle: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    color: C.text,
  },
  partnerBtnSub: {
    // Finding 40: sub-lines are one body size.
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center' as const,
    color: C.textSecondary,
  },
  partnerDivider: {
    height: 10,
  },
  legal: {
    // Finding 40: fine print is one small sans size (caption, 15pt)
    // — never minuscule.
    fontSize: T.size.caption,
    textAlign: 'center' as const,
    lineHeight: T.leading.caption,
    letterSpacing: 0.5,
    color: C.textSecondary,
    marginBottom: 12,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 40,
  },
  legalLinkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  // Lane D (PL-H13): per lane mapping; old normal 13.4.
  legalLinkText: {
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
    textDecorationLine: 'underline',
  },
  legalDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.3,
  },
});
