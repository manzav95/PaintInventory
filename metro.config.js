// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Get absolute path to server folder
const serverPath = path.resolve(__dirname, 'server').replace(/\\/g, '/');

// Store original resolveRequest
const originalResolveRequest = config.resolver.resolveRequest;

// Block server folder from Metro bundler
config.resolver = {
  ...config.resolver,
  blockList: [
    // Block server directory using absolute path
    new RegExp(`^${serverPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`),
    // Block any path containing /server/ or \server\
    /.*[\/\\]server[\/\\].*/,
  ],
  resolveRequest: (context, moduleName, platform) => {
    // Block any attempt to import "server" or "./server"
    if (
      moduleName === 'server' ||
      moduleName === './server' ||
      moduleName === '../server' ||
      moduleName.includes('/server/') ||
      moduleName.includes('\\server\\')
    ) {
      // Return path to empty module file
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, 'empty-module.js'),
      };
    }
    
    // Use default resolver for everything else
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    // Fallback
    return context.resolveRequest(context, moduleName, platform);
  },
};

// Exclude server from watchFolders
config.watchFolders = [__dirname];

module.exports = config;

