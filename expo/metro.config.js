const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);

const rorkConfig = withRorkMetro(config);

const sdkLibPath = path.resolve(
  __dirname,
  "node_modules/@rork-ai/toolkit-sdk/lib/module"
);

const originalResolve = rorkConfig.resolver.resolveRequest;
rorkConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@rork-ai/toolkit-sdk/v53") {
    return {
      filePath: path.resolve(sdkLibPath, "dev/sdk53/index.js"),
      type: "sourceFile",
    };
  }
  if (moduleName === "@rork-ai/toolkit-sdk/v54") {
    return {
      filePath: path.resolve(sdkLibPath, "dev/sdk54/index.js"),
      type: "sourceFile",
    };
  }
  if (originalResolve) {
    return originalResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = rorkConfig;
