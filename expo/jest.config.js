module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Reanimated (2026-11-17, splash motion): the real package ships
    // ESM under lib/module/ and needs its native module, neither of
    // which works in this node-env Jest setup. Map it to the manual
    // mock in __mocks__/ — Reanimated's own shipped mock was tried
    // first and rejected: it imports react-native's real component
    // tree, which dies in NativeModules ("__fbBatchedBridgeConfig is
    // not set") without the RN jest preset this repo does not use.
    // See the header comment in __mocks__/react-native-reanimated.js.
    '^react-native-reanimated$':
      '<rootDir>/__mocks__/react-native-reanimated.js',
    // P0-5 (2026-11-16): the Apple server helper lives in
    // backend/functions/_shared/ (outside expo/), and babel-jest
    // injects @babel/runtime helpers into it — which resolve relative
    // to that file, where no node_modules exists. Pin the runtime to
    // this project's copy. No effect on expo/ files (they already
    // resolve @babel/runtime here).
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
};
