// Manual Jest mock for react-native-reanimated.
//
// Why a hand-written mock instead of Reanimated's own mock.js:
// the shipped mock (src/mock.ts) imports react-native's real
// component tree (View, Animated, ...), which needs the native
// bridge / RN jest preset. This repo runs Jest in a plain node env
// with logic-only tests and no RN preset, so the shipped mock dies
// in NativeModules ("__fbBatchedBridgeConfig is not set").
// This stub keeps the importable API surface — shared values,
// animation builders, the Animated namespace, layout animations —
// as plain-JS no-ops, so any test that imports a module using
// Reanimated can load and run. It does not animate anything.
//
// If a test ever needs real animation stepping, adopt the RN jest
// preset and switch the mapper in jest.config.js to
// node_modules/react-native-reanimated/mock.js instead.

function makeSharedValue(initial) {
  return { value: initial };
}

// Animation builders: return the target value, as if finished.
function withTiming(toValue) {
  return toValue;
}
function withSpring(toValue) {
  return toValue;
}
function withDecay(config) {
  return config && config.velocity !== undefined ? 0 : 0;
}
function withDelay(_delay, animation) {
  return animation;
}
function withSequence(...animations) {
  return animations.length > 0
    ? animations[animations.length - 1]
    : undefined;
}
function withRepeat(animation) {
  return animation;
}
function withClamp(_config, animation) {
  return animation;
}

function cancelAnimation() {}
function makeMutable(initial) {
  return { value: initial };
}
function isSharedValue(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    'value' in value
  );
}
function isWorkletFunction(value) {
  return typeof value === 'function' && value.__workletHash !== undefined;
}
function runOnJS(fn) {
  return fn;
}
function runOnUI(fn) {
  return fn;
}
function runOnUISync(fn) {
  return fn;
}
function interpolate(value, inputRange, outputRange) {
  if (!Array.isArray(inputRange) || !Array.isArray(outputRange)) {
    return value;
  }
  // Deterministic stub: return the first output for any input.
  return outputRange[0];
}

const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  quad: (t) => t,
  cubic: (t) => t,
  poly: () => (t) => t,
  sin: (t) => t,
  circle: (t) => t,
  exp: (t) => t,
  back: () => (t) => t,
  bounce: (t) => t,
  elastic: () => (t) => t,
  bezier: () => (t) => t,
  bezierFn: () => (t) => t,
  in: (easing) => easing,
  out: (easing) => easing,
  inOut: (easing) => easing,
};

const Extrapolation = {
  IDENTITY: 'identity',
  CLAMP: 'clamp',
  EXTEND: 'extend',
};

// Chainable stub for entering/exiting/layout animations
// (FadeIn.duration(300).delay(100), etc.).
function makeAnimationStub() {
  const stub = {};
  const chainable = [
    'build',
    'duration',
    'delay',
    'easing',
    'springify',
    'damping',
    'mass',
    'stiffness',
    'overshootClamping',
    'restDisplacementThreshold',
    'restSpeedThreshold',
    'withInitialValues',
    'withCallback',
    'randomDelay',
  ];
  chainable.forEach((method) => {
    stub[method] = (...args) => {
      if (method === 'build') {
        return {};
      }
      return stub;
    };
  });
  return stub;
}

const FadeIn = makeAnimationStub();
const FadeOut = makeAnimationStub();
const FadeInDown = makeAnimationStub();
const FadeInUp = makeAnimationStub();
const FadeInLeft = makeAnimationStub();
const FadeInRight = makeAnimationStub();
const FadeOutDown = makeAnimationStub();
const FadeOutUp = makeAnimationStub();
const FadeOutLeft = makeAnimationStub();
const FadeOutRight = makeAnimationStub();
const SlideInDown = makeAnimationStub();
const SlideInUp = makeAnimationStub();
const SlideInLeft = makeAnimationStub();
const SlideInRight = makeAnimationStub();
const SlideOutDown = makeAnimationStub();
const SlideOutUp = makeAnimationStub();
const SlideOutLeft = makeAnimationStub();
const SlideOutRight = makeAnimationStub();
const ZoomIn = makeAnimationStub();
const ZoomOut = makeAnimationStub();
const Layout = makeAnimationStub();
const LinearTransition = makeAnimationStub();
const CurvedTransition = makeAnimationStub();
const JumpingTransition = makeAnimationStub();
const SequencedTransition = makeAnimationStub();
const FadingTransition = makeAnimationStub();

// Animated.* components: render nothing in node-env tests.
// createAnimatedComponent returns the wrapped component unchanged.
function createAnimatedComponent(Component) {
  return Component;
}

function NullComponent() {
  return null;
}

const Animated = {
  View: NullComponent,
  Text: NullComponent,
  Image: NullComponent,
  ScrollView: NullComponent,
  FlatList: NullComponent,
  SectionList: NullComponent,
  createAnimatedComponent,
};

module.exports = {
  __esModule: true,
  default: Animated,
  Animated,
  useSharedValue: makeSharedValue,
  useAnimatedStyle: (updater) => {
    try {
      return updater();
    } catch {
      return {};
    }
  },
  useAnimatedProps: (updater) => {
    try {
      return updater();
    } catch {
      return {};
    }
  },
  useAnimatedRef: () => ({ current: null }),
  useAnimatedReaction: () => {},
  useAnimatedScrollHandler: () => () => {},
  useAnimatedGestureHandler: () => () => {},
  useDerivedValue: (updater) => {
    try {
      return { value: updater() };
    } catch {
      return { value: undefined };
    }
  },
  useFrameCallback: () => {},
  useReducedMotion: () => false,
  useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),
  useAnimatedSensor: () => ({ x: { value: 0 }, y: { value: 0 }, z: { value: 0 } }),
  useScrollViewOffset: () => ({ value: 0 }),
  withTiming,
  withSpring,
  withDecay,
  withDelay,
  withSequence,
  withRepeat,
  withClamp,
  cancelAnimation,
  makeMutable,
  isSharedValue,
  isWorkletFunction,
  runOnJS,
  runOnUI,
  runOnUISync,
  interpolate,
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeInUp,
  FadeInLeft,
  FadeInRight,
  FadeOutDown,
  FadeOutUp,
  FadeOutLeft,
  FadeOutRight,
  SlideInDown,
  SlideInUp,
  SlideInLeft,
  SlideInRight,
  SlideOutDown,
  SlideOutUp,
  SlideOutLeft,
  SlideOutRight,
  ZoomIn,
  ZoomOut,
  Layout,
  LinearTransition,
  CurvedTransition,
  JumpingTransition,
  SequencedTransition,
  FadingTransition,
  createAnimatedComponent,
  // Re-exported React Native Animated stand-ins.
  View: NullComponent,
  Text: NullComponent,
  Image: NullComponent,
  ScrollView: NullComponent,
  FlatList: NullComponent,
};
