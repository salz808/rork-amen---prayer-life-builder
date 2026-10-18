import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

type TruthProps = {
  truth: string;
  reference: string;
};

function TodayTruth(props: TruthProps) {
  'widget';
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
    </VStack>
  );
}

export default createWidget('TodayTruth', TodayTruth);
