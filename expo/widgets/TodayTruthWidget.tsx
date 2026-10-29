import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
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
 * at full height. NOTE (round-3 B-L1): app.json enables only
 * systemSmall + systemMedium, so the systemLarge/systemExtraLarge
 * branches below are currently unreachable dead weight, kept only so
 * a future family enablement needs no code change; under the current
 * config the sign-off appears on medium only, when the truth is short.
 *
 * TAP (widget fix): the whole widget is tappable via the `widgetURL`
 * modifier on the root VStack — WidgetKit's documented whole-widget
 * tap mechanism (SwiftUI `.widgetURL`, one per hierarchy). Tapping
 * opens `amen-app://(tabs)`, the app's Home tab group: `(tabs)` is a
 * real Stack screen in app/_layout.tsx and an allowlisted first
 * segment in app/+native-intent.tsx, so the link lands on Home rather
 * than falling back or dead-ending. `widgetURL` was chosen over a
 * `Link` view: a Link would also render as native SwiftUI Link, but
 * widgetURL is the widget-idiomatic tap (entire tile, no label styling
 * to fight) and cannot be nested wrong.
 *
 * NO MIC BUTTON — DELIBERATE (widget fix): there is no mic button
 * here because TRIAD has no voice-ask destination route, and a mic
 * button that deep-links nowhere would be dishonest. Wiring one
 * needs Kai to approve a destination route first. Honesty note for
 * that future work: even then, the button could only ever be a deep
 * link into the app — a widget cannot record audio.
 */
function TodayTruth(props: TruthProps, context: WidgetEnvironment) {
  'widget';
  const truth = props.truth || 'You are His beloved.';
  // The sign-off is a fingerprint line, but it still has a legibility
  // floor (10.5pt). On medium, a long truth plus the sign-off can clip
  // the reference, so medium only carries it when the truth is short.
  // Large/extra-large branches are unreachable under the current
  // app.json config (see header note); they would always show it.
  const showSignOff =
    context.widgetFamily === 'systemLarge' ||
    context.widgetFamily === 'systemExtraLarge' ||
    (context.widgetFamily === 'systemMedium' && truth.length <= 90);

  return (
    <VStack spacing={6} modifiers={[padding({ all: 12 }), widgetURL('amen-app://(tabs)')]}>
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
