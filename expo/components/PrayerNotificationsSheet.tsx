import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import {
  formatPrayerNotificationHeadline,
  formatPrayerNotificationTimeAgo,
  type PrayerNotification,
} from '@/lib/prayerNotifications';

interface PrayerNotificationsSheetProps {
  visible: boolean;
  onClose: () => void;
  notifications: PrayerNotification[];
  loading: boolean;
  /** Tap an entry: the parent closes the sheet and lands on the wall post. */
  onEntryPress: (echoId: string) => void;
}

/**
 * The "someone prayed for you" bell sheet. Quiet by design: no counts are
 * boasted anywhere, no pray-er is ever named (the server row carries no
 * pray-er identity), and each row shows only the author's own request
 * text plus the milestone headline.
 */
export default function PrayerNotificationsSheet({
  visible,
  onClose,
  notifications,
  loading,
  onEntryPress,
}: PrayerNotificationsSheetProps) {
  const C = useColors();
  const T = useTypography();
  // Lane D (PL-H15): stylesheet moved to createStyles(T) so the two
  // Wave 3: block lineHeights now use the same token leading as the inline sizes.
  const styles = useMemo(() => createStyles(T), [T]);
  const slideAnim = useState(() => new Animated.Value(400))[0];
  const bgAnim = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 14, useNativeDriver: true }),
        Animated.timing(bgAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 400, duration: 250, useNativeDriver: true }),
        Animated.timing(bgAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, bgAnim]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, absoluteFillObject, { opacity: bgAnim }]}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={absoluteFillObject} />
        </TouchableWithoutFeedback>
      </Animated.View>
      <View style={styles.sheetContainer} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: C.surface,
              transform: [{ translateY: slideAnim }],
              maxHeight: '80%',
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: C.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifRegular, fontSize: T.size.scripture, lineHeight: T.leading.scripture }]}>Prayed for you</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              testID="prayer-notifications-close"
              accessibilityRole="button"
              accessibilityLabel="Close notifications"
            >
              <X size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {loading ? (
              <Text style={[styles.emptyText, { color: C.textSecondary, fontFamily: Fonts.titleMedium, fontSize: T.size.bodySmall, lineHeight: T.leading.bodySmall }]}>
                Loading…
              </Text>
            ) : notifications.length === 0 ? (
              <Text style={[styles.emptyText, { color: C.textSecondary, fontFamily: Fonts.titleMedium, fontSize: T.size.bodySmall, lineHeight: T.leading.bodySmall }]}>
                No one has prayed for your requests yet. When someone does, it will appear here.
              </Text>
            ) : (
              notifications.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.row, { borderColor: C.borderLight }]}
                  onPress={() => onEntryPress(n.echoId)}
                  testID={`prayer-notification-${n.id}`}
                >
                  <Text style={[styles.rowEmoji, { fontSize: T.scale(14) }]}>🙏</Text>
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowHeadline, { color: C.text, fontFamily: Fonts.titleSemiBold, fontSize: T.size.bodySmall, lineHeight: T.leading.bodySmall }]}>
                      {formatPrayerNotificationHeadline(n.milestone)}
                    </Text>
                    {n.echoText ? (
                      <Text
                        style={[styles.rowText, { color: C.textSecondary, fontFamily: Fonts.titleLight, fontSize: T.size.body, lineHeight: T.leading.body }]}
                        numberOfLines={2}
                      >
                        {n.echoText}
                      </Text>
                    ) : null}
                    <Text style={[styles.rowTime, { color: C.textSecondary, fontFamily: Fonts.titleLight, fontSize: T.size.caption, lineHeight: T.leading.caption }]}>
                      {formatPrayerNotificationTimeAgo(n.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(T: any) {
  return StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
  },
  emptyText: {
    lineHeight: T.leading.bodySmall,
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowEmoji: {
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowHeadline: {
  },
  rowText: {
    lineHeight: T.leading.body,
  },
  rowTime: {
  },
  });
}
