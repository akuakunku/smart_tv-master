const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// MATIKAN CACHE STORE YANG MENYEBABKAN ERROR
config.cacheStores = [];

module.exports = config;