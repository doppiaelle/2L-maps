/** Reanimated 4 moved its Babel plugin into react-native-worklets; it must stay last. */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: ['react-native-worklets/plugin'],
  };
};
