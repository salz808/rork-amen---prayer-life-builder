import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { RefreshCw, Sprout } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery } from '@tanstack/react-query';
import AnimatedPressable from '@/components/AnimatedPressable';
import GlowButton from '@/components/GlowButton';
import { getAnnualTrialLabel } from '@/lib/purchasesTrial';
import { useApp } from '@/providers/AppProvider';
import { useScreenProtection } from '@/hooks/useScreenProtection';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

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

type BillingPeriod = 'monthly' | 'annual';
type TierId = 'partner';

type TierInfo = {
  id: TierId;
  title: string;
  headline: string;
  monthlyPrice: string;
  annualPrice: string;
  body: string;
  featured?: boolean;
  monthlyPkg?: PurchasesPackage;
  annualPkg?: PurchasesPackage;
};

function findPackage(packages: PurchasesPackage[], productId: string): PurchasesPackage | undefined {
  return packages.find((pkg) => pkg.product.identifier === productId || pkg.identifier === productId);
}

const PRODUCT_IDS = {
  partnerMonthly: 'triad_missions_monthly',
  partnerAnnual: 'triad_missions_annual',
} as const;

const getPurchases = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- react-native-purchases is lazily required so Expo Go (no native module) degrades to null instead of crashing at import time.
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
};

const Purchases = getPurchases();

function StaggerItem({ children, index }: { children: React.ReactNode; index: number }) {
  const opacity = useState(() => new Animated.Value(index > 4 ? 1 : 0))[0]
  const translateY = useState(() => new Animated.Value(index > 4 ? 0 : 16))[0]

  useEffect(() => {
    if (index > 4) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    opacity.setValue(0);
    translateY.setValue(16);

    const delay = index * 40;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export default function GiveScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { syncSubscription, setSubscribedSinceMonthly, state } = useApp();

  useScreenProtection(true, 'give-screen');

  const [purchasedTierId, setPurchasedTierId] = useState<TierId | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  const headerFadeAnim = useState(() => new Animated.Value(0))[0]
  const headerSlideAnim = useState(() => new Animated.Value(12))[0]
  const toggleFadeAnim = useState(() => new Animated.Value(0))[0]
  const toggleSlideAnim = useState(() => new Animated.Value(16))[0]
  const contentFadeAnim = useState(() => new Animated.Value(0))[0]
  const contentSlideAnim = useState(() => new Animated.Value(16))[0]
  const ambientPulse = useState(() => new Animated.Value(0.35))[0]

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(headerFadeAnim, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(headerSlideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(toggleFadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(toggleSlideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(contentFadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentSlideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ambientPulse, {
          toValue: 0.58,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ambientPulse, {
          toValue: 0.3,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [ambientPulse, contentFadeAnim, contentSlideAnim, headerFadeAnim, headerSlideAnim, toggleFadeAnim, toggleSlideAnim]);

  // UI/UX audit 2026-11-10 (G1): in Expo Go the RevenueCat native module
  // is absent, so getOfferings() always throws and the screen showed a
  // misleading "couldn't load — check your connection" error with a
  // RETRY that could never succeed. Detect the preview and say so
  // honestly instead; the App Store build is where giving works.
  const isExpoGo = Constants.appOwnership === 'expo';

  const offeringsQuery = useQuery({
    queryKey: ['offerings'],
    queryFn: async (): Promise<PurchasesOffering | null> => {
      if (isExpoGo) {
        if (__DEV__) {
          console.log('[Give] Expo Go preview — store unavailable, skipping offerings');
        }
        return null;
      }
      if (!Purchases) {
        if (__DEV__) {
          console.log('[Give] RevenueCat not available');
        }
        return null;
      }

      const offerings = await Purchases.getOfferings();
      return offerings.current ?? null;
    },
    retry: false,
  });

  const packages = useMemo<PurchasesPackage[]>(() => offeringsQuery.data?.availablePackages ?? [], [offeringsQuery.data?.availablePackages]);

  const tiers = useMemo<TierInfo[]>(() => {
    return [
      {
        id: 'partner',
        title: 'Partner',
        headline: 'All in. Both directions.',
        monthlyPrice: findPackage(packages, PRODUCT_IDS.partnerMonthly)?.product.priceString ?? '$4.99',
        annualPrice: findPackage(packages, PRODUCT_IDS.partnerAnnual)?.product.priceString ?? '$39.99',
        // Kai-approved 2026-10-26 (bundle 19, Partner definition):
        // plain first sentence — Partner is a monthly or yearly gift,
        // not a status or a person.
        body: 'Partner means a monthly or yearly gift that supports this ministry.\nYour gift keeps prayer free for someone learning to pray, and sends this ministry further.\n· Audio narration & declarations\n· Adjustable playback speed\n· All 4 soundscapes\n· The Monastic theme\n· Full library & every journey to revisit',
        featured: true,
        monthlyPkg: findPackage(packages, PRODUCT_IDS.partnerMonthly),
        annualPkg: findPackage(packages, PRODUCT_IDS.partnerAnnual),
      },
    ];
  }, [packages]);

  // Audit round 3, J-S22: same store-derived trial wording as the
  // paywall legal line — never a hardcoded day count.
  const giveAnnualTrialLabel = getAnnualTrialLabel(findPackage(packages, PRODUCT_IDS.partnerAnnual), packages.length > 0);
  const giveAnnualTrialPhrase = giveAnnualTrialLabel === 'FREE TRIAL'
    ? 'a free trial'
    : (giveAnnualTrialLabel?.toLowerCase() ?? 'a free trial');

  const purchaseMutation = useMutation({
    mutationFn: async ({ pkg, period }: { pkg: PurchasesPackage; period: 'monthly' | 'annual' }) => {
      if (!Purchases) {
        throw new Error('Purchases not available');
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return { customerInfo, pkg, period };
    },
    onSuccess: ({ customerInfo, pkg, period }) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const activeEntitlements = Object.keys(customerInfo.entitlements.active);
      syncSubscription(activeEntitlements);
      // Billing period captured at purchase time (same fix as the
      // paywall): the annual upsell clock runs off the monthly start.
      if (period === 'monthly') {
        if (!state.subscribedSinceMonthly) {
          setSubscribedSinceMonthly(new Date().toISOString());
        }
      } else {
        setSubscribedSinceMonthly(null);
      }
      const tierId = tiers.find((tier) => tier.monthlyPkg?.identifier === pkg.identifier || tier.annualPkg?.identifier === pkg.identifier)?.id ?? null;
      if (__DEV__) {
        console.log('[Give] Purchase successful', { identifier: pkg.identifier, tierId });
      }
      // Thank-you keys off the granted entitlement, not the package-id
      // match (same fix as the paywall).
      if (activeEntitlements.length > 0) {
        setPurchasedTierId(tierId ?? 'partner');
        return;
      }
      if (tierId) {
        setPurchasedTierId(tierId);
        return;
      }
      Alert.alert('Thank you!', 'Your support means everything.');
    },
    onError: (error: unknown) => {
      const err = error as { userCancelled?: boolean };
      if (__DEV__) {
        console.log('[Give] Purchase failed', { userCancelled: err.userCancelled ?? false });
      }
      if (!err.userCancelled) {
        Alert.alert('Something went wrong', 'Please try again.');
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!Purchases) {
        throw new Error('Purchases not available');
      }

      return await Purchases.restorePurchases();
    },
    onSuccess: (customerInfo: { entitlements: { active: Record<string, unknown> } }) => {
      const hasActive = Object.keys(customerInfo.entitlements.active).length > 0;
      if (__DEV__) {
        console.log('[Give] Restore completed', { hasActive });
      }
      if (hasActive) {
        syncSubscription(Object.keys(customerInfo.entitlements.active));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored!', 'Your support has been restored.');
        return;
      }
      Alert.alert('Nothing to restore', 'No active subscriptions found.');
    },
    onError: (error: unknown) => {
      if (__DEV__) {
        console.log('[Give] Restore failed', error);
      }
      Alert.alert('Restore failed', 'Please try again later.');
    },
  });

  const handlePurchase = useCallback((tier: TierInfo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isExpoGo) {
      Alert.alert(
        'Giving isn’t available in this preview',
        'The App Store isn’t connected here, so purchases can’t load. Giving works in the App Store build.',
      );
      return;
    }

    const pkg = billingPeriod === 'monthly' ? tier.monthlyPkg : tier.annualPkg;

    if (__DEV__) {
      console.log('[Give] Purchase tapped', { tierId: tier.id, billingPeriod, hasPackage: Boolean(pkg) });
    }

    if (pkg) {
      purchaseMutation.mutate({ pkg, period: billingPeriod });
      return;
    }

    Alert.alert('Plan unavailable', 'This plan could not be loaded from the store. Please check your connection and try again.');
  }, [billingPeriod, purchaseMutation, isExpoGo]);

  const handleOpenLink = useCallback((url: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Linking.openURL(url).catch(() => {
      Alert.alert('Couldn’t open that page', 'Check your connection and try again.');
    });
  }, []);

  const renderSkeleton = () => {
    return Array.from({ length: 1 }).map((_, index) => (
      <StaggerItem key={`skeleton-${index}`} index={index}>
        <View style={styles.skeletonCard} testID={`give-skeleton-${index}`}>
          <Animated.View style={[styles.skeletonGlow, { opacity: ambientPulse }]} />
          <View style={styles.skeletonTopRow}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonTitleBlock}>
              <View style={styles.skeletonLineShort} />
              <View style={styles.skeletonLineMedium} />
            </View>
          </View>
          <View style={styles.skeletonPrice} />
          <View style={styles.skeletonBodyLong} />
          <View style={styles.skeletonBodyMedium} />
          <View style={styles.skeletonButton} />
        </View>
      </StaggerItem>
    ));
  };

  return (
    <View style={styles.root} testID="give-screen">
      <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
        locations={[0, 0.24, 0.62, 1]}
        style={styles.ambientVeil}
      />
      <Animated.View style={[styles.ambientTopWrap, { opacity: ambientPulse }]} pointerEvents="none">
        <LinearGradient
          colors={[C.accentBg, C.transparent]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.ambientTop}
        />
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          bounces={true}
          decelerationRate="fast"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          testID="give-scroll"
        >
          <Animated.View style={{ opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }}>
            <View style={styles.headerWrap}>
              <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>SUPPORT THIS CAUSE</Text>
              <Text style={[styles.title, { fontFamily: Fonts.serifMedium }]}>Free for everyone.</Text>
              <Text style={[styles.mission, { fontFamily: Fonts.italic }]}>Your generosity is what makes that possible.</Text>
            </View>
          </Animated.View>

          {/* F-21: the billing toggle is a dead control in Expo Go — no
              packages ever load there, so it sits over an empty screen. */}
          {!isExpoGo && (
          <Animated.View style={{ opacity: toggleFadeAnim, transform: [{ translateY: toggleSlideAnim }] }}>
            <View style={styles.billingToggle} testID="give-billing-toggle">
              {(['monthly', 'annual'] as BillingPeriod[]).map((period) => {
                const isActive = billingPeriod === period;
                return (
                  <AnimatedPressable
                    key={period}
                    onPress={() => setBillingPeriod(period)}
                    style={[styles.toggleBtn, isActive && styles.toggleBtnActive]}
                    scaleValue={0.96}
                    testID={`give-toggle-${period}`}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        { fontFamily: isActive ? Fonts.titleSemiBold : Fonts.titleMedium },
                        isActive && styles.toggleTextActive,
                      ]}
                    >
                      {period === 'monthly' ? 'Monthly' : 'Annual'}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </Animated.View>
          )}

          <Animated.View style={{ opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }}>
            <View style={styles.tiersContainer}>
              {offeringsQuery.isLoading
                ? renderSkeleton()
                : isExpoGo
                  ? (
                    <View style={{ marginVertical: 24, paddingHorizontal: 16, alignItems: 'center' }} testID="give-expo-go-note">
                      <Text style={{ fontSize: T.size.body, lineHeight: T.leading.body, color: C.text, fontFamily: Fonts.serifRegular, textAlign: 'center' }}>
                        Giving isn’t available in this preview. The App Store isn’t connected here, so prices can’t load. Giving works in the App Store build.
                      </Text>
                    </View>
                  )
                  : offeringsQuery.isError
                  ? (
                    <View style={{ marginVertical: 24, paddingHorizontal: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: T.size.body, lineHeight: T.leading.body, color: C.text, fontFamily: Fonts.serifRegular, textAlign: 'center' }}>
                        Giving options couldn’t load. Check your connection and try again. Restore below still works.
                      </Text>
                      <Pressable
                        onPress={() => void offeringsQuery.refetch()}
                        style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, minHeight: 44, justifyContent: 'center', borderRadius: 100, borderWidth: 1, borderColor: 'rgba(200,137,74,0.4)' }}
                      >
                        <Text style={{ fontSize: T.size.button, lineHeight: T.leading.button, letterSpacing: 1.5, color: C.accentDark, fontFamily: Fonts.titleBold }}>RETRY</Text>
                      </Pressable>
                    </View>
                  )
                  : packages.length === 0
                  ? (
                    // F-17: the store answered but returned no packages.
                    // Say so plainly with a RETRY instead of rendering
                    // the tier card on the $4.99/$39.99 fallbacks — those
                    // are data defaults only, never a buyable card.
                    <View style={{ marginVertical: 24, paddingHorizontal: 16, alignItems: 'center' }} testID="give-no-packages">
                      <Text style={{ fontSize: T.size.body, lineHeight: T.leading.body, color: C.text, fontFamily: Fonts.serifRegular, textAlign: 'center' }}>
                        Giving options aren’t available right now. The store didn’t return any plans.
                      </Text>
                      <Pressable
                        onPress={() => void offeringsQuery.refetch()}
                        style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, minHeight: 44, justifyContent: 'center', borderRadius: 100, borderWidth: 1, borderColor: 'rgba(200,137,74,0.4)' }}
                      >
                        <Text style={{ fontSize: T.size.button, lineHeight: T.leading.button, letterSpacing: 1.5, color: C.accentDark, fontFamily: Fonts.titleBold }}>RETRY</Text>
                      </Pressable>
                    </View>
                  )
                  : tiers.map((tier, index) => {
                    const priceLabel = billingPeriod === 'monthly' ? `${tier.monthlyPrice}/mo` : `${tier.annualPrice}/yr`;
                    const isPurchased = purchasedTierId === tier.id;

                    return (
                      <StaggerItem key={tier.id} index={index}>
                        <View style={[styles.tierCard, tier.featured && styles.tierCardFeatured]} testID={`tier-card-${tier.id}`}>
                          <LinearGradient
                            colors={tier.featured ? [C.surfaceElevated, C.cardGradientEnd] : [C.phaseCardBg, C.surface]}
                            start={{ x: 0.1, y: 0 }}
                            end={{ x: 0.9, y: 1 }}
                            style={styles.tierCardInner}
                          >
                            <LinearGradient
                              colors={[C.transparent, tier.featured ? C.dayChipTodayBorder : C.tierBadgeAmberBorder, C.transparent]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.tierCardTopLine}
                            />

                            <View style={styles.tierTopRow}>
                              <View style={[styles.tierIconWrap, styles.tierIconWrapAmber]}>
                                <Sprout size={24} color={C.accentDark} />
                              </View>
                              <View style={styles.tierMeta}>
                                <View style={styles.tierNameRow}>
                                  <Text style={[styles.tierName, { fontFamily: Fonts.titleSemiBold }]} numberOfLines={2}>{tier.title}</Text>
                                </View>
                                <Text style={[styles.tierHeadline, { fontFamily: Fonts.italic }]}>{tier.headline}</Text>
                                <View style={styles.priceRow}>
                                  <Text style={[styles.tierPrice, { fontFamily: Fonts.titleMedium }]}>{priceLabel}</Text>
                                  {billingPeriod === 'annual' && (
                                    <View style={[styles.annualPill, styles.annualPillBest]}>
                                      <Text style={[
                                        styles.annualHint,
                                        styles.annualHintBest,
                                        { fontFamily: Fonts.titleBold },
                                      ]}>
                                        best value
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                            </View>

                            <Text style={[styles.tierBody, { fontFamily: Fonts.serifRegular }]}>{tier.body}</Text>

                            {isPurchased ? (
                              <View style={styles.thankYouSection} testID={`tier-thank-you-${tier.id}`}>
                                <Text style={[styles.thankYouTitle, { fontFamily: Fonts.serifRegular }]}>Thank you.</Text>
                                <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular }]}>You are now part of something bigger than an app. Your support keeps TRIAD Prayer free for someone who needs it most and cannot pay. And it sends the Gospel to a place it has not reached yet.</Text>
                                <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular }]}>We don&apos;t take that lightly.</Text>
                              </View>
                            ) : (
                              <GlowButton
                                label="BECOME A PARTNER"
                                onPress={() => handlePurchase(tier)}
                                disabled={purchaseMutation.isPending || restoreMutation.isPending}
                              />
                            )}
                          </LinearGradient>
                        </View>
                      </StaggerItem>
                    );
                  })}
            </View>

            <View style={styles.footerNote} testID="give-footer-note">
              <Text style={[styles.footerNoteText, { fontFamily: Fonts.italic }]}>No investors. No ads. No agenda.{"\n"}Just people who pray, funding people who need to hear about Jesus.</Text>
            </View>

            <AnimatedPressable
              style={styles.restoreBtn}
              // Finding 71: restoreBtn itself carries no shadow, but
              // AnimatedPressable renders a resting glow layer (shadow
              // opacity 0.18, radius 10) behind any pressable with a
              // non-transparent background — that glow was the shadow
              // visible under Restore. Disable it here; the tier card
              // keeps its own elevation shadow.
              disableGlow
              onPress={() => {
                if (isExpoGo) {
                  Alert.alert(
                    'Restore isn’t available in this preview',
                    'The App Store isn’t connected here. Restore works in the App Store build.',
                  );
                  return;
                }
                restoreMutation.mutate();
              }}
              scaleValue={0.96}
              disabled={purchaseMutation.isPending || restoreMutation.isPending}
              testID="restore-purchases"
            >
              {restoreMutation.isPending ? (
                <ActivityIndicator color={C.textMuted} size="small" />
              ) : (
                <>
                  <RefreshCw size={16} color={C.textMuted} />
                  <Text style={[styles.restoreText, { fontFamily: Fonts.titleMedium }]}>Restore purchases</Text>
                </>
              )}
            </AnimatedPressable>

            {/* F-21: in Expo Go the trial + $39.99 promise is fiction — no
                store is connected. Suppress the line there entirely. */}
            {!isExpoGo && (
            <Text style={[styles.legal, { fontFamily: Fonts.titleLight }]}>Annual plans start with {giveAnnualTrialPhrase} where available. You won&apos;t be charged until it ends, then {findPackage(packages, PRODUCT_IDS.partnerAnnual)?.product.priceString ?? '$39.99'}/year unless cancelled. Subscriptions renew automatically; cancel anytime in your App Store account settings.</Text>
            )}

            <View style={styles.legalLinks}>
              <AnimatedPressable onPress={() => handleOpenLink('https://tearsandoil.com/triadprivacy')} scaleValue={0.96} style={styles.legalLinkBtn} testID="give-privacy-link">
                <Text style={[styles.legalLinkText, { fontFamily: Fonts.titleMedium }]}>Privacy Policy</Text>
              </AnimatedPressable>
              <View style={styles.legalDot} />
              <AnimatedPressable onPress={() => handleOpenLink('https://tearsandoil.com/triadterms')} scaleValue={0.96} style={styles.legalLinkBtn} testID="give-terms-link">
                <Text style={[styles.legalLinkText, { fontFamily: Fonts.titleMedium }]}>Terms of Use</Text>
              </AnimatedPressable>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function createStyles(C: ReturnType<typeof useColors>, T: ReturnType<typeof useTypography>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.background,
      overflow: 'hidden' as const,
    },
    ambientVeil: {
      ...absoluteFillObject,
    },
    ambientTopWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    },
    ambientTop: {
      height: 220,
    },
    safeArea: {
      flex: 1,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 150,
    },
    headerWrap: {
      marginBottom: 20,
      gap: 8,
    },
    eyebrow: {
      color: C.accentDark,
      fontSize: T.size.label,
      lineHeight: T.leading.label,
      letterSpacing: 2,
    },
    title: {
      color: C.text,
      fontSize: T.size.title,
      lineHeight: T.leading.title,
    },
    mission: {
      color: C.textSecondary,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      maxWidth: 320,
    },
    billingToggle: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      backgroundColor: C.chipBg,
      borderColor: C.chipBorder,
      borderWidth: 1,
      borderRadius: 12,
      padding: 4,
      marginBottom: 20,
      gap: 4,
    },
    toggleBtn: {
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
    },
    toggleBtnActive: {
      // Finding 71: unified with the paywall toggle — browner amber
      // C.accent (not pale-tan C.accentDark) + white text, so the same
      // Monthly/Annual control looks the same everywhere.
      backgroundColor: C.accent,
    },
    toggleText: {
      color: C.textSecondary,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    toggleTextActive: {
      color: C.white,
    },
    tiersContainer: {
      gap: 14,
      marginBottom: 22,
    },
    tierCard: {
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
      backgroundColor: C.phaseCardBg,
      shadowColor: C.text,
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 2,
    },
    tierCardFeatured: {
      borderColor: C.dayChipTodayBorder,
    },
    tierCardInner: {
      padding: 18,
      position: 'relative',
    },
    tierCardTopLine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
    },
    tierTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      marginBottom: 16,
    },
    tierIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    tierIconWrapAmber: {
      backgroundColor: C.tierIconAmberBg,
      borderColor: C.tierIconAmberBorder,
    },
    tierMeta: {
      flex: 1,
      gap: 6,
      minWidth: 0,
    },
    tierNameRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    tierName: {
      color: C.text,
      flex: 1,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 0.1,
    },
    tierHeadline: {
      color: C.accentDark,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    tierPrice: {
      color: C.text,
      fontSize: T.size.title,
      lineHeight: T.leading.title,
    },
    annualPill: {
      alignSelf: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.tierBadgeAmberBorder,
      backgroundColor: C.tierBadgeAmberBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 4,
    },
    annualPillBest: {
      borderColor: C.dayChipTodayBorder,
      backgroundColor: C.accentBg,
    },
    annualHint: {
      color: C.tierBadgeAmberText,
      fontSize: T.size.caption,
      letterSpacing: 1,
      lineHeight: T.leading.caption,
      textTransform: 'uppercase' as const,
    },
    annualHintBest: {
      color: C.accentDark,
    },
    tierBody: {
      color: C.textSecondary,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      marginBottom: 18,
    },
    thankYouSection: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      backgroundColor: C.accentBg,
      padding: 16,
      gap: 8,
    },
    thankYouTitle: {
      color: C.text,
      fontSize: T.size.title,
      lineHeight: T.leading.title,
      textAlign: 'center',
    },
    thankYouText: {
      color: C.textSecondary,
      fontSize: T.size.bodySmall,
      lineHeight: T.leading.bodySmall,
      textAlign: 'center',
    },
    footerNote: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.footerNoteBorder,
      backgroundColor: C.footerNoteBg,
      padding: 16,
      marginBottom: 20,
    },
    footerNoteText: {
      color: C.footerNoteText,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      textAlign: 'center',
    },
    restoreBtn: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.borderLight,
      backgroundColor: C.supportRowBg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 16,
    },
    restoreText: {
      color: C.textSecondary,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    legal: {
      color: C.textSecondary,
      fontSize: T.size.footnote,
      lineHeight: T.leading.footnote,
      textAlign: 'center',
      marginBottom: 12,
    },
    legalLinks: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 40,
    },
    legalLinkBtn: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    legalLinkText: {
      color: C.textSecondary,
      fontSize: T.size.footnote,
      lineHeight: T.leading.footnote,
      textDecorationLine: 'underline' as const,
    },
    legalDot: {
      width: 4,
      height: 4,
      borderRadius: 4,
      backgroundColor: C.iconMuted,
    },
    skeletonCard: {
      overflow: 'hidden',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
      backgroundColor: C.phaseCardBg,
      padding: 16,
      gap: 12,
      minHeight: 248,
    },
    skeletonGlow: {
      ...absoluteFillObject,
      backgroundColor: C.overlayLight,
    },
    skeletonTopRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    skeletonIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: C.supportRowHoverBg,
    },
    skeletonTitleBlock: {
      flex: 1,
      gap: 8,
    },
    skeletonLineShort: {
      width: '44%',
      height: 12,
      borderRadius: 8,
      backgroundColor: C.supportRowHoverBg,
    },
    skeletonLineMedium: {
      width: '64%',
      height: 16,
      borderRadius: 8,
      backgroundColor: C.supportRowHoverBg,
    },
    skeletonPrice: {
      width: '34%',
      height: 28,
      borderRadius: 8,
      backgroundColor: C.supportRowHoverBg,
    },
    skeletonBodyLong: {
      width: '100%',
      height: 64,
      borderRadius: 8,
      backgroundColor: C.supportRowHoverBg,
    },
    skeletonBodyMedium: {
      width: '84%',
      height: 20,
      borderRadius: 8,
      backgroundColor: C.supportRowHoverBg,
    },
    skeletonButton: {
      width: '100%',
      height: 48,
      borderRadius: 12,
      backgroundColor: C.supportRowHoverBg,
      marginTop: 'auto',
    },
  });
}
