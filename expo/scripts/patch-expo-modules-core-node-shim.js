const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'node_modules', 'expo-modules-core', 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.log('[patch-expo-modules-core-node-shim] package.json not found, skipping');
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const exportsField = packageJson.exports && typeof packageJson.exports === 'object' ? packageJson.exports : {};
const rootExport = exportsField['.'] && typeof exportsField['.'] === 'object' ? exportsField['.'] : {};

packageJson.exports = {
  ...exportsField,
  '.': {
    node: './node-shim.cjs',
    ...rootExport,
    default: rootExport.default || './src/index.ts',
  },
  './package.json': './package.json',
};

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log('[patch-expo-modules-core-node-shim] patched expo-modules-core/package.json');
