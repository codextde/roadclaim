const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Hermes ships TextDecoder without utf-16le; h3-js constructs one at load time.
const h3Shim = path.resolve(__dirname, 'src/ui-lib/h3-shim.js');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'h3-js' && context.originModulePath !== h3Shim) {
    return { type: 'sourceFile', filePath: h3Shim };
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
