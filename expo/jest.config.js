module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
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
