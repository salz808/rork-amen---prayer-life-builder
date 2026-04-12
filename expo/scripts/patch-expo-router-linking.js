const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'node_modules', 'expo-router', 'build', 'getLinkingConfig.js');

if (!fs.existsSync(targetPath)) {
  console.log('[patch-expo-router-linking] target file not found, skipping');
  process.exit(0);
}

const source = fs.readFileSync(targetPath, 'utf8');
const next = source
  .replace(
    'const react_native_1 = require("react-native");',
    'const expo_modules_core_1 = require("expo-modules-core");'
  )
  .replace(
    "if (react_native_1.Platform.OS === 'web') {",
    "if (expo_modules_core_1.Platform.OS === 'web') {"
  );

if (source === next) {
  console.log('[patch-expo-router-linking] patch already applied');
  process.exit(0);
}

fs.writeFileSync(targetPath, next);
console.log('[patch-expo-router-linking] patched expo-router/build/getLinkingConfig.js');
