const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

const projectRoot = __dirname;
const extensions = config.resolver.sourceExts || ['ts', 'tsx', 'js', 'jsx', 'json'];

function resolveWithExtensions(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }
  for (const ext of extensions) {
    const withExt = `${basePath}.${ext}`;
    if (fs.existsSync(withExt)) {
      return withExt;
    }
  }
  for (const ext of extensions) {
    const indexFile = path.join(basePath, `index.${ext}`);
    if (fs.existsSync(indexFile)) {
      return indexFile;
    }
  }
  return null;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const relativePath = moduleName.slice(2);
    const basePath = path.resolve(projectRoot, relativePath);
    const resolved = resolveWithExtensions(basePath);
    if (resolved) {
      return { filePath: resolved, type: 'sourceFile' };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
