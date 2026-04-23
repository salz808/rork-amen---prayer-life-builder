import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery } from '@tanstack/react-query';
import AnimatedPressable from '@/components/AnimatedPressable';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';

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
type TierId = 'pay_it_forward' | 'missions' | 'partner';
type BadgeTone = 'amber' | 'moss';
type ButtonTone = 'amber' | 'moss';

type TierInfo = {
  id: TierId;
  emoji: string;
  title: string;
  badge: string;
  badgeTone: BadgeTone;
  headline: string;
  monthlyPrice: string;
  annualPrice: string;
  body: string;
  cta: string;
  buttonTone: ButtonTone;
  featured?: boolean;
  monthlyPkg?: PurchasesPackage;
  annualPkg?: PurchasesPackage;
};

const getPurchases = () => {
  try {
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
};

const Purchases = getPurchases();

function StaggerItem({ children, index }: { children: React.ReactNode; index: number }) {
  const opacity = useRef(new Animated.Value(index > 4 ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(index > 4 ? 0 : 16)).current;

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

  const [purchasedTierId, setPurchasedTierId] = useState<TierId | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(12)).current;
  const toggleFadeAnim = useRef(new Animated.Value(0)).current;
  const toggleSlideAnim = useRef(new Animated.Value(16)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const contentSlideAnim = useRef(new Animated.Value(16)).current;
  const ambientPulse = useRef(new Animated.Value(0.35)).current;

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

  const offeringsQuery = useQuery({
    queryKey: ['offerings'],
    queryFn: async (): Promise<PurchasesOffering | null> => {
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
        id: 'pay_it_forward',
        emoji: '🤍',
        title: 'Support Development',
        badge: 'Support',
        badgeTone: 'amber',
        headline: 'Keep the lights on.',
        monthlyPrice: packages.find((pkg) => pkg.identifier === 'amen_pay_it_forward')?.product.priceString ?? '$1.99',
        annualPrice: packages.find((pkg) => pkg.identifier === 'amen_pay_it_forward_annual')?.product.priceString ?? '$14.99',
        body: 'Every dollar keeps this app free for everyone who needs it — no exceptions.\n· Dark mode\n· 2 soundscapes\n· Playback speed\n· Full session history',
        cta: 'Support Development →',
        buttonTone: 'amber',
        monthlyPkg: packages.find((pkg) => pkg.identifier === 'amen_pay_it_forward'),
        annualPkg: packages.find((pkg) => pkg.identifier === 'amen_pay_it_forward_annual'),
      },
      {
        id: 'missions',
        emoji: '🌍',
        title: 'Missions',
        badge: 'Missions',
        badgeTone: 'amber',
        headline: 'Pray here. Fund there.',
        monthlyPrice: packages.find((pkg) => pkg.identifier === 'amen_missions')?.product.priceString ?? '$4.99',
        annualPrice: packages.find((pkg) => pkg.identifier === 'amen_missions_annual')?.product.priceString ?? '$34.99',
        body: 'Most of what you give goes straight to global missions. You pray in your living room. Someone hears about Jesus across the world.\n· Everything in Support\n· Audio narration\n· Declarations audio\n· Daily Prayer Mode\n· Streak heat map\n· 3 soundscapes',
        cta: 'Fund Missions →',
        buttonTone: 'amber',
        featured: true,
        monthlyPkg: packages.find((pkg) => pkg.identifier === 'amen_missions'),
        annualPkg: packages.find((pkg) => pkg.identifier === 'amen_missions_annual'),
      },
      {
        id: 'partner',
        emoji: '🌱',
        title: 'Kingdom Partner',
        badge: 'Partner',
        badgeTone: 'moss',
        headline: 'All in. Both directions.',
        monthlyPrice: packages.find((pkg) => pkg.identifier === 'amen_partner')?.product.priceString ?? '$9.99',
        annualPrice: packages.find((pkg) => pkg.identifier === 'amen_partner_annual')?.product.priceString ?? '$99.99',
        body: 'Half builds this app. Half funds the mission field. This is Kingdom math.\n· Everything in Missions\n· Full library access\n· Monastic + seasonal themes\n· Retreat Mode\n· 4 soundscapes',
        cta: 'Become a Partner →',
        buttonTone: 'moss',
        monthlyPkg: packages.find((pkg) => pkg.identifier === 'amen_partner'),
        annualPkg: packages.find((pkg) => pkg.identifier === 'amen_partner_annual'),
      },
    ];
  }, [packages]);

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      if (!Purchases) {
        throw new Error('Purchases not available');
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return { customerInfo, pkg };
    },
    onSuccess: ({ pkg }) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const tierId = tiers.find((tier) => tier.monthlyPkg?.identifier === pkg.identifier || tier.annualPkg?.identifier === pkg.identifier)?.id ?? null;
      if (__DEV__) {
        console.log('[Give] Purchase successful', { identifier: pkg.identifier, tierId });
      }
      if (tierId) {
        setPurchasedTierId(tierId);
        return;
      }
      Alert.alert('Thank you! 🙏', 'Your support means everything.');
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
    const pkg = billingPeriod === 'monthly' ? tier.monthlyPkg : (tier.annualPkg ?? tier.monthlyPkg);

    if (__DEV__) {
      console.log('[Give] Purchase tapped', { tierId: tier.id, billingPeriod, hasPackage: Boolean(pkg) });
    }

    if (pkg) {
      purchaseMutation.mutate(pkg);
      return;
    }

    Alert.alert('Coming Soon', 'Subscriptions will be available when the app launches.');
  }, [billingPeriod, purchaseMutation]);

  const handleOpenLink = useCallback((url: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Linking.openURL(url);
  }, []);

  const renderSkeleton = () => {
    return Array.from({ length: 3 }).map((_, index) => (
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
              <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>Free. Always.</Text>
              <Text style={[styles.mission, { fontFamily: Fonts.italic }]}>Your generosity is what makes that possible.</Text>
            </View>
          </Animated.View>

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

          <Animated.View style={{ opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }}>
            <View style={styles.tiersContainer}>
              {offeringsQuery.isLoading
                ? renderSkeleton()
                : tiers.map((tier, index) => {
                    const priceLabel = billingPeriod === 'monthly' ? `${tier.monthlyPrice}/mo` : `${tier.annualPrice}/yr`;
                    const isPurchased = purchasedTierId === tier.id;
                    const buttonGradient: readonly [string, string] = tier.buttonTone === 'moss'
                      ? [C.mossBtnGradientStart, C.mossBtnGradientEnd]
                      : [C.amberBtnGradientStart, C.amberBtnGradientEnd];
                    const badgeStyles = tier.badgeTone === 'moss'
                      ? [styles.tierBadge, styles.tierBadgeMoss]
                      : [styles.tierBadge, styles.tierBadgeAmber];
                    const badgeTextStyles = tier.badgeTone === 'moss'
                      ? [styles.tierBadgeText, styles.tierBadgeTextMoss]
                      : [styles.tierBadgeText, styles.tierBadgeTextAmber];
                    const iconStyles = tier.badgeTone === 'moss'
                      ? [styles.tierIconWrap, styles.tierIconWrapMoss]
                      : [styles.tierIconWrap, styles.tierIconWrapAmber];

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
                              <View style={iconStyles}>
                                <Text style={styles.tierEmoji}>{tier.emoji}</Text>
                              </View>
                              <View style={styles.tierMeta}>
                                <View style={styles.tierNameRow}>
                                  <Text style={[styles.tierName, { fontFamily: Fonts.titleSemiBold }]}>{tier.title}</Text>
                                  <View style={badgeStyles}>
                                    <Text style={[...badgeTextStyles, { fontFamily: Fonts.titleBold }]}>{tier.badge}</Text>
                                  </View>
                                </View>
                                <Text style={[styles.tierHeadline, { fontFamily: Fonts.italic }]}>{tier.headline}</Text>
                                <Text style={[styles.tierPrice, { fontFamily: Fonts.titleLight }]}>{priceLabel}</Text>
                              </View>
                            </View>

                            <Text style={[styles.tierBody, { fontFamily: Fonts.serifRegular }]}>{tier.body}</Text>

                            {isPurchased ? (
                              <View style={styles.thankYouSection} testID={`tier-thank-you-${tier.id}`}>
                                <Text style={styles.thankYouEmoji}>🙏</Text>
                                <Text style={[styles.thankYouTitle, { fontFamily: Fonts.serifRegular }]}>Thank you.</Text>
                                <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular }]}>You just became part of something bigger than an app. Your support keeps Amen free for the person who needs it most and can&apos;t pay for it — and sends the Gospel somewhere it hasn&apos;t been yet.</Text>
                                <Text style={[styles.thankYouText, { fontFamily: Fonts.serifRegular }]}>We don&apos;t take that lightly.</Text>
                              </View>
                            ) : (
                              <AnimatedPressable
                                onPress={() => handlePurchase(tier)}
                                style={styles.tierButtonWrap}
                                scaleValue={0.96}
                                disabled={purchaseMutation.isPending || restoreMutation.isPending}
                                testID={`purchase-${tier.id}`}
                              >
                                <LinearGradient colors={buttonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tierButtonGradient}>
                                  {purchaseMutation.isPending ? (
                                    <ActivityIndicator color={C.white} size="small" />
                                  ) : (
                                    <Text style={[styles.tierButtonText, { fontFamily: Fonts.titleSemiBold }]}>{tier.cta}</Text>
                                  )}
                                </LinearGradient>
                              </AnimatedPressable>
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
              onPress={() => restoreMutation.mutate()}
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

            <Text style={[styles.legal, { fontFamily: Fonts.titleLight }]}>Subscriptions renew monthly. Cancel anytime in your device settings.</Text>

            <View style={styles.legalLinks}>
              <AnimatedPressable onPress={() => handleOpenLink('https://iammadewhole.com/privacy')} scaleValue={0.96} testID="give-privacy-link">
                <Text style={[styles.legalLinkText, { fontFamily: Fonts.titleMedium }]}>Privacy Policy</Text>
              </AnimatedPressable>
              <View style={styles.legalDot} />
              <AnimatedPressable onPress={() => handleOpenLink('https://iammadewhole.com/terms')} scaleValue={0.96} testID="give-terms-link">
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
    },
    ambientVeil: {
      ...StyleSheet.absoluteFillObject,
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
      paddingTop: 16,
      paddingBottom: 120,
    },
    headerWrap: {
      marginBottom: 20,
      gap: 8,
    },
    eyebrow: {
      color: C.accentDark,
      fontSize: T.scale(11),
      letterSpacing: 2,
    },
    title: {
      color: C.text,
      fontSize: T.scale(34),
      lineHeight: T.scale(36),
    },
    mission: {
      color: C.textSecondary,
      fontSize: T.scale(15),
      lineHeight: T.scale(20),
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
      backgroundColor: C.accentDark,
    },
    toggleText: {
      color: C.textSecondary,
      fontSize: T.scale(12),
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    toggleTextActive: {
      color: C.white,
    },
    tiersContainer: {
      gap: 12,
      marginBottom: 20,
    },
    tierCard: {
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
      backgroundColor: C.phaseCardBg,
    },
    tierCardFeatured: {
      borderColor: C.dayChipTodayBorder,
    },
    tierCardInner: {
      padding: 16,
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
      gap: 12,
      marginBottom: 16,
    },
    tierIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    tierIconWrapAmber: {
      backgroundColor: C.tierIconAmberBg,
      borderColor: C.tierIconAmberBorder,
    },
    tierIconWrapMoss: {
      backgroundColor: C.tierIconMossBg,
      borderColor: C.tierIconMossBorder,
    },
    tierEmoji: {
      fontSize: T.scale(20),
    },
    tierMeta: {
      flex: 1,
      gap: 4,
    },
    tierNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    tierName: {
      color: C.text,
      fontSize: T.scale(14),
      letterSpacing: 0.2,
    },
    tierBadge: {
      minHeight: 24,
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    tierBadgeAmber: {
      backgroundColor: C.tierBadgeAmberBg,
      borderColor: C.tierBadgeAmberBorder,
    },
    tierBadgeMoss: {
      backgroundColor: C.tierBadgeMossBg,
      borderColor: C.tierBadgeMossBorder,
    },
    tierBadgeText: {
      fontSize: T.scale(9),
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    },
    tierBadgeTextAmber: {
      color: C.tierBadgeAmberText,
    },
    tierBadgeTextMoss: {
      color: C.tierBadgeMossText,
    },
    tierHeadline: {
      color: C.accentDark,
      fontSize: T.scale(14),
      lineHeight: T.scale(18),
    },
    tierPrice: {
      color: C.text,
      fontSize: T.scale(28),
      lineHeight: T.scale(30),
    },
    tierBody: {
      color: C.textSecondary,
      fontSize: T.scale(15),
      lineHeight: T.scale(24),
      marginBottom: 16,
    },
    tierButtonWrap: {
      borderRadius: 12,
      overflow: 'hidden',
    },
    tierButtonGradient: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    tierButtonText: {
      color: C.white,
      fontSize: T.scale(13),
      letterSpacing: 0.8,
    },
    thankYouSection: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      backgroundColor: C.accentBg,
      padding: 16,
      gap: 8,
    },
    thankYouEmoji: {
      fontSize: T.scale(22),
      textAlign: 'center',
    },
    thankYouTitle: {
      color: C.text,
      fontSize: T.scale(24),
      textAlign: 'center',
    },
    thankYouText: {
      color: C.textSecondary,
      fontSize: T.scale(14),
      lineHeight: T.scale(20),
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
      fontSize: T.scale(15),
      lineHeight: T.scale(22),
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
      color: C.textMuted,
      fontSize: T.scale(13),
    },
    legal: {
      color: C.textMuted,
      fontSize: T.scale(10),
      lineHeight: T.scale(16),
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
    legalLinkText: {
      color: C.textMuted,
      fontSize: T.scale(12),
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
      ...StyleSheet.absoluteFillObject,
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
