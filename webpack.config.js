// Alternative Webpack 5 pipeline (reference). The verified, zero-extra-dependency pipeline
// is `node scripts/build-webos.mjs` (esbuild + Babel -> ES5 -> ares-package).
//
// To use this file instead:
//   npm i -D webpack webpack-cli babel-loader ts-loader html-webpack-plugin mini-css-extract-plugin css-loader copy-webpack-plugin
//   npx webpack --mode production      # output in ./dist-webpack, then: ares-package dist-webpack
import path from "node:path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";

export default {
  entry: path.resolve("src/main.tsx"), // src/polyfills.ts is imported first inside main.tsx
  output: { path: path.resolve("dist-webpack"), filename: "app.js", publicPath: "" },
  target: ["web", "es5"],
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules\/(?!(hls\.js)\/)/,
        use: [{ loader: "babel-loader" }, { loader: "ts-loader", options: { transpileOnly: true } }],
      },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, "css-loader"] },
      // The parser worker is bundled as an inline Blob worker (works from file:// on webOS).
      { test: /\.worker\.ts$/, resourceQuery: /inline/, use: [{ loader: "worker-loader", options: { inline: "no-fallback" } }, "babel-loader", "ts-loader"] },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: "app.css" }),
    new HtmlWebpackPlugin({ templateContent: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>StreamPlayer</title></head><body><div id="root"></div><script src="webOSTV.js"></script></body></html>', scriptLoading: "blocking", inject: "body" }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "public/appinfo.json" },
        { from: "public/icon.png" },
        { from: "public/largeIcon.png" },
        { from: "public/webOSTV.js" },
      ],
    }),
  ],
  performance: { hints: false },
};
