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
 * at all, so the sign-off is reserved for medium and larger families.
 */
function TodayTruth(props: TruthProps, context: WidgetEnvironment) {
  'widget';
  const showSignOff =
    context.widgetFamily === 'systemMedium' ||
    context.widgetFamily === 'systemLarge' ||
    context.widgetFamily === 'systemExtraLarge';

  return (
    <VStack spacing={6} modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle('secondary')]}>
        TODAY'S TRUTH
      </Text>
      <Text modifiers={[font({ size: 15, weight: 'medium' })]}>
        {props.truth || 'You are His beloved.'}
      </Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle('secondary')]}>
        {props.reference || 'TRIAD Prayer'}
      </Text>
      {showSignOff ? (
        <Text modifiers={[font({ size: 9 }), foregroundStyle('secondary'), padding({ top: 3 })]}>
          {SIGN_OFF}
        </Text>
      ) : null}
    </VStack>
  );
}

export default createWidget('TodayTruth', TodayTruth);
