import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, TouchableWithoutFeedback, ActivityIndicator, Alert } from 'react-native';
import { Lock, Heart } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import { getAnnualTrialLabel } from '@/lib/purchasesTrial';
import GlowButton from '@/components/GlowButton';
import { useApp } from '@/providers/AppProvider';

interface FeatureLockSheetProps {
  visible: boolean;
  onClose: () => void;
  featureName: string;
  requirement: string;
  /** Kai-approved 2026-10-26: when set, this exact sentence replaces the
   * "reserved for our {requirement} partners" line. Needed for
   * non-tier gates such as Daily Prayer ("Graduates partners" was
   * wrong). Usages without it render exactly as before. */
  description?: string;
}

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

const PRODUCT_IDS = {
  // Single Partner tier — these store products carry the $4.99 / $39.99 prices.
  partnerMonthly: 'triad_missions_monthly',
  partnerAnnual: 'triad_missions_annual',
} as const;

function findPackage(packages: PurchasesPackage[], productId: string): PurchasesPackage | undefined {
  return packages.find((pkg) => pkg.product.identifier === productId || pkg.identifier === productId);
}

const getPurchases = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- react-native-purchases is lazily required so Expo Go (no native module) degrades to null instead of crashing at import time.
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
};

const Purchases = getPurchases();

export default function FeatureLockSheet({
  visible,
  onClose,
  featureName,
  requirement,
  description
}: FeatureLockSheetProps) {
  const C = useColors();
  const router = useRouter();
  // Lane D (PL-H12): house pattern so Larger Text scales this sheet.
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { state, syncSubscription, setSubscribedSinceMonthly } = useApp();
  const slideAnim = useState(() => new Animated.Value(400))[0]
  const bgAnim = useState(() => new Animated.Value(0))[0]

  // Finding 36: the sheet IS the trial/upgrade screen — but only for
  // Partner gates. A custom description means a non-tier gate (e.g.
  // Daily Prayer, which is free on journey completion) — those keep
  // the notice-only layout and must never sell Partner.
  const showUpgrade = !description && /partner/i.test(requirement);

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual');
  const [purchased, setPurchased] = useState(false);

  // Finding 38 (same honest-Expo-Go handling as Give/paywall): in Expo
  // Go the RevenueCat native module is absent, so getOfferings() always
  // throws. Skip the fetch and say so honestly instead of showing an
  // error + a RETRY that could never succeed.
  const isExpoGo = Constants.appOwnership === 'expo';

  const offeringsQuery = useQuery({
    queryKey: ['offerings'],
    queryFn: async (): Promise<PurchasesOffering | null> => {
      if (isExpoGo) {
        if (__DEV__) {
          console.log('[LockSheet] Expo Go preview — store unavailable, skipping offerings');
        }
        return null;
      }
      if (!Purchases) {
        if (__DEV__) {
          console.log('[LockSheet] RevenueCat not available');
        }
        return null;
      }
      const offerings = await Purchases.getOfferings();
      return offerings.current ?? null;
    },
    retry: false,
    enabled: visible && showUpgrade,
  });

  const packages = offeringsQuery.data?.availablePackages ?? [];
  const hasStoreData = packages.length > 0;
  const monthlyPkg = findPackage(packages, PRODUCT_IDS.partnerMonthly);
  const annualPkg = findPackage(packages, PRODUCT_IDS.partnerAnnual);
  // Store-derived trial wording (J-S22): the trial is claimed only when
  // the store confirms the annual introductory offer. No store data (or
  // no trial) means no trial badge and no trial CTA — never a hardcoded
  // "7-day" promise.
  const annualTrialLabel = getAnnualTrialLabel(annualPkg, hasStoreData);
  const selectedPkg = billingPeriod === 'monthly' ? monthlyPkg : annualPkg;
  const selectedPrice = billingPeriod === 'monthly'
    ? (monthlyPkg?.product.priceString ?? '$4.99')
    : (annualPkg?.product.priceString ?? '$39.99');

  const purchaseMutation = useMutation({
    mutationFn: async ({ pkg, period }: { pkg: PurchasesPackage; period: 'monthly' | 'annual' }) => {
      if (!Purchases) throw new Error('Purchases not available');
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return { customerInfo, period };
    },
    onSuccess: ({ customerInfo, period }) => {
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
      if (activeEntitlements.length > 0) {
        setPurchased(true);
      } else {
        Alert.alert('Your kindness makes a real difference', 'Thank you for walking with us.', [
          { text: 'Amen', onPress: () => onClose() },
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
      if (activeEntitlements.length > 0) {
        syncSubscription(activeEntitlements);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // 4-angle audit 2026-11-14 (restore parity): the paywall's
        // restore ends in the same 'Welcome back' alert whose Continue
        // leaves the screen — the lock sheet used to swap to its
        // in-sheet thank-you instead, one extra hop (thank-you state,
        // then DONE). Mirror the paywall exactly.
        Alert.alert('Welcome back. Your Partner access is restored.', undefined, [
          { text: 'Continue', onPress: () => onClose() },
        ]);
      } else {
        Alert.alert('Nothing to restore', "We couldn't find a past subscription on this store account. If you subscribed with a different Apple ID or Google account, sign in with that one and try again.");
      }
    },
    onError: () => {
      Alert.alert('Restore failed', "Restore didn't work right now. Check your connection and try again. Your existing purchases are unaffected.");
    },
  });

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 14,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, bgAnim]);

  const handleSeeOptions = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setTimeout(() => {
      router.push('/paywall');
    }, 300);
  };

  const handlePurchase = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isExpoGo) {
      Alert.alert(
        'Purchases aren’t available in this preview',
        'The App Store isn’t connected here, so purchases can’t load. Partner works in the App Store build.',
      );
      return;
    }
    if (selectedPkg) {
      purchaseMutation.mutate({ pkg: selectedPkg, period: billingPeriod });
    } else {
      Alert.alert('Plan unavailable', 'This plan could not be loaded from the store. Please check your connection and try again.');
    }
  };

  const handleRestore = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isExpoGo) {
      Alert.alert(
        'Restore isn’t available in this preview',
        'The App Store isn’t connected here. Restore works in the App Store build.',
      );
      return;
    }
    restoreMutation.mutate();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: bgAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: C.surface, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: C.border }]} />

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
          <View style={styles.content}>
            <View style={[styles.iconWrap, { backgroundColor: C.accentBg }]}>
              <Lock size={24} color={C.accentDark} />
            </View>

            <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifRegular }]}>
              {featureName}
            </Text>

            <Text style={[styles.description, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>
              {description ?? (<>
                This feature is reserved for our{' '}
                <Text style={{ color: C.accentDark, fontFamily: Fonts.titleSemiBold }}>
                  {requirement}
                </Text>
                .
              </>)}
            </Text>

            {showUpgrade && purchased ? (
              <View style={styles.thankYou}>
                <Text style={[styles.thankYouTitle, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>
                  Welcome, Partner.
                </Text>
                <Text style={[styles.thankYouText, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>
                  Thank you for carrying this mission with us.
                </Text>
                {/* F-03/F-05 (4-angle audit 2026-11-14): the DONE button
                    is a GlowButton now — dark #180C02 text on amber
                    instead of white. */}
                <View testID="lock-sheet-done" style={{ width: '100%' }}>
                  <GlowButton label="DONE" onPress={onClose} style={{ marginBottom: 16 }} />
                </View>
              </View>
            ) : showUpgrade ? (
              <>
                <View style={[styles.infoBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                   <Heart size={16} color={C.accentDark} style={{ marginBottom: 8 }} />
                   <Text style={[styles.infoText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                     Every dollar helps keep this app free for everyone.
                   </Text>
                </View>

                {/* F-03 (4-angle audit 2026-11-14): same white-on-amber
                    defect as the paywall toggle lived here too
                    (toggleTextActive '#FFF' on C.accent) — both
                    segments are GlowButtons now, active segment dark
                    text on amber, inactive ghost. */}
                <View style={styles.billingToggle}>
                  <View testID="lock-sheet-toggle-monthly" style={{ minWidth: 120 }}>
                    <GlowButton
                      label="MONTHLY"
                      variant={billingPeriod === 'monthly' ? 'primary' : 'ghost'}
                      onPress={() => setBillingPeriod('monthly')}
                    />
                  </View>
                  <View testID="lock-sheet-toggle-annual" style={{ minWidth: 120 }}>
                    <GlowButton
                      label="ANNUAL"
                      variant={billingPeriod === 'annual' ? 'primary' : 'ghost'}
                      onPress={() => setBillingPeriod('annual')}
                    />
                  </View>
                </View>

                {offeringsQuery.isLoading ? (
                  <ActivityIndicator color="#C8894A" style={{ marginVertical: 24 }} />
                ) : offeringsQuery.isError ? (
                  <View style={{ marginVertical: 16, alignItems: 'center' }}>
                    <Text style={[styles.noteText, { color: C.text, fontFamily: Fonts.titleRegular }]}>
                      Subscription options couldn’t load. Check your connection and try again.
                    </Text>
                    <TouchableOpacity
                      onPress={() => void offeringsQuery.refetch()}
                      style={styles.retryBtn}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.retryBtnText, { fontFamily: Fonts.titleBold }]}>RETRY</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.planBox, { borderColor: C.border, backgroundColor: C.surfaceAlt }]}>
                    <View style={styles.planRow}>
                      <Text style={[styles.planName, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Partner</Text>
                      <Text style={[styles.planPrice, { color: C.text, fontFamily: Fonts.titleMedium }]}>
                        {selectedPrice}
                        <Text style={[styles.planPeriod, { color: C.textSecondary, fontFamily: Fonts.titleLight }]}>
                          {billingPeriod === 'monthly' ? '/mo' : '/yr'}
                        </Text>
                      </Text>
                    </View>
                    {billingPeriod === 'annual' && annualTrialLabel ? (
                      <View style={styles.trialBadge}>
                        <Text style={[styles.trialBadgeText, { fontFamily: Fonts.titleBold }]}>
                          {annualTrialLabel}
                        </Text>
                      </View>
                    ) : null}
                    {billingPeriod === 'annual' ? (
                      <Text style={[styles.planSub, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>
                        Best value. Save 33% vs monthly.
                      </Text>
                    ) : null}
                    {isExpoGo ? (
                      <Text style={[styles.noteText, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]} testID="lock-sheet-expo-go-note">
                        Subscriptions can’t load in this preview. The App Store isn’t connected here.
                      </Text>
                    ) : null}
                  </View>
                )}

                {/* F-03/F-05 (4-angle audit 2026-11-14): the purchase CTA
                    is a GlowButton now — dark #180C02 text on the amber
                    gradient instead of white (primaryBtnText '#FFF').
                    The S6 label rides on the button via GlowButton's
                    accessibilityLabel prop (restored in the fix pass);
                    the price/period/trial also read as the plan box's
                    own text above it. */}
                <View testID="lock-sheet-purchase" style={{ width: '100%' }}>
                  <GlowButton
                    label={purchaseMutation.isPending
                      ? 'Processing...'
                      : billingPeriod === 'annual' && annualTrialLabel
                        ? `START ${annualTrialLabel}`
                        : 'BECOME A PARTNER'}
                    onPress={handlePurchase}
                    disabled={purchaseMutation.isPending || restoreMutation.isPending}
                    style={{ marginBottom: 16 }}
                    // Audit round 3, S6 (restored 2026-11-14): the spoken
                    // label carries price / period / trial, not just the
                    // visible CTA — passed through GlowButton's
                    // accessibilityLabel prop (verbatim from HEAD).
                    accessibilityLabel={billingPeriod === 'annual' && annualTrialLabel ? `Start ${annualTrialLabel.toLowerCase()}, then ${selectedPrice} per year` : `Become a Partner, ${selectedPrice} per ${billingPeriod === 'monthly' ? 'month' : 'year'}`}
                  />
                </View>

                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={handleRestore}
                  disabled={purchaseMutation.isPending || restoreMutation.isPending}
                  activeOpacity={0.6}
                  testID="lock-sheet-restore"
                >
                  {restoreMutation.isPending ? (
                    <ActivityIndicator color={C.textSecondary} size="small" />
                  ) : (
                    <Text style={[styles.restoreBtnText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                      Restore purchases
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.infoBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                   <Heart size={16} color={C.accentDark} style={{ marginBottom: 8 }} />
                   <Text style={[styles.infoText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                     Every dollar helps keep this app free for everyone. And it helps share the Gospel of Jesus Christ with the world.
                   </Text>
                </View>

                {/* F-05: same white-on-amber bespoke button, same fix. */}
                <GlowButton label="SEE SUPPORT OPTIONS" onPress={handleSeeOptions} style={{ width: '100%', marginBottom: 16 }} />
              </>
            )}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.6}
              testID="lock-sheet-close"
            >
              <Text style={[styles.cancelBtnText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                MAYBE LATER
              </Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(C: any, T: any) {
  return StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...absoluteFillObject,
    backgroundColor: 'rgba(8, 4, 1, 0.85)',
  },
  sheet: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
    maxHeight: '88%',
  },
  scroll: {
    flexShrink: 1,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 32,
  },
  content: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    // Finding 35: body copy larger locally — sans (Montserrat reads
    // larger than Cormorant at the same pt) at the body size, not
    // small serif.
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center',
    marginBottom: 24,
  },
  infoBox: {
    width: '100%',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoText: {
    // Finding 35: was bodySmall (16) — now the full body size.
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center',
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    alignSelf: 'center',
    gap: 8,
  },
  planBox: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
    gap: 8,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  planName: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 0.3,
  },
  planPrice: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    letterSpacing: -0.5,
  },
  planPeriod: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
  },
  planSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
  },
  trialBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,137,74,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trialBadgeText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  noteText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.4)',
  },
  retryBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.5,
    color: C.accentDark,
  },
  restoreBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 8,
  },
  restoreBtnText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center',
  },
  thankYou: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  thankYouTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    textAlign: 'center',
  },
  thankYouText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center',
    marginBottom: 8,
  },
  cancelBtn: {
    paddingVertical: 16,
  },
  cancelBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1,
  },
  });
}
