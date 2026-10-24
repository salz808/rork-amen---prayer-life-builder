import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

type TruthProps = {
  truth: string;
  reference: string;
};

const SIGN_OFF = 'God is real. Jesus loves you, and your life matters.';

/**
 * The ministry sign-off rides at the bottom of the widget — TRIAD's
 * fingerprint on someone else's home screen. It only appears where it
 * can stay legible: the small (2x2) widget is already truth + reference
 * at full height, and the lock-screen accessory families have no room
 * at all, so the sign-off is reserved for the large families, and for
 * medium when the day's truth is short enough to leave it room.
 */
function TodayTruth(props: TruthProps, context: WidgetEnvironment) {
  'widget';
  const truth = props.truth || 'You are His beloved.';
  // The sign-off is a fingerprint line, but it still has a legibility
  // floor (10.5pt). On medium, a long truth plus the sign-off can clip
  // the reference, so medium only carries it when the truth is short;
  // large and extra-large always have room.
  const showSignOff =
    context.widgetFamily === 'systemLarge' ||
    context.widgetFamily === 'systemExtraLarge' ||
    (context.widgetFamily === 'systemMedium' && truth.length <= 90);

  return (
    <VStack spacing={6} modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle('secondary')]}>
        TODAY&apos;S TRUTH
      </Text>
      <Text modifiers={[font({ size: 15, weight: 'medium' })]}>
        {truth}
      </Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle('secondary')]}>
        {props.reference || 'TRIAD Prayer'}
      </Text>
      {showSignOff ? (
        <Text modifiers={[font({ size: 10.5 }), foregroundStyle('secondary'), padding({ top: 3 })]}>
          {SIGN_OFF}
        </Text>
      ) : null}
    </VStack>
  );
}

export default createWidget('TodayTruth', TodayTruth);
