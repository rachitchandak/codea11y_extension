// @ts-check
"use strict";

const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

/** @type {import('webpack').Configuration} */
const extensionConfig = {
  target: "node",
  mode: "none",
  entry: "./src/extension.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: "ts-loader",
      },
    ],
  },
  devtool: "nosources-source-map",
};

/** @param {string} entry */
/** @param {string} outputFilename */
function createWebviewConfig(entry, outputFilename) {
  return {
    target: "web",
    mode: "none",
    entry,
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: outputFilename,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: "ts-loader",
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, "css-loader", "postcss-loader"],
        },
        {
          test: /\.(woff|woff2|ttf|eot)$/,
          type: "asset/resource",
          generator: {
            filename: "fonts/[name][ext]",
          },
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: outputFilename.replace(".js", ".css"),
      }),
    ],
    devtool: "nosources-source-map",
  };
}

const sidebarConfig = createWebviewConfig(
  "./src/webview/sidebar/index.tsx",
  "sidebar.js"
);

const reportConfig = createWebviewConfig(
  "./src/webview/report/index.tsx",
  "report.js"
);

module.exports = [extensionConfig, sidebarConfig, reportConfig];
