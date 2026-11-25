// Babel configuration used by scripts/build-webos.mjs (and by webpack.config.js).
// Output is ES5 for LG webOS 3.x (Chromium 38). Runtime polyfills (core-js,
// regenerator-runtime, whatwg-fetch) are imported explicitly in src/polyfills.ts.
export default {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: { chrome: "38" },
        modules: false,
        useBuiltIns: false,
        bugfixes: false,
      },
    ],
  ],
  comments: false,
};
