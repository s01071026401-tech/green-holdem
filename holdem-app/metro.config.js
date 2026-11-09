const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws' && (platform === 'ios' || platform === 'android')) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'ws.native.js'),
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;