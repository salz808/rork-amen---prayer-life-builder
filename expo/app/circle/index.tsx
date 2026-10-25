import { Redirect } from 'expo-router';
import { FEATURES } from '@/constants/features';

// Bare /circle names no circle: send users to the list — or to the wall
// while Circles are hidden for launch, mirroring the invite gate —
// instead of landing on the not-found screen.
export default function CircleIndexGate() {
  return <Redirect href={FEATURES.circles ? '/circles' : '/(tabs)/community'} />;
}
