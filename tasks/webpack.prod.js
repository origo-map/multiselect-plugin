const webpack = require('webpack');
const { merge } = require('webpack-merge');
const common = require('./webpack.common');

module.exports = merge(common, {
  optimization: {
    nodeEnv: 'production',
    minimize: true
  },
  performance: {
    hints: false
  },
  output: {
    path: `${__dirname}/../build/js`,
    filename: 'multiselect.min.js',
    libraryTarget: 'var',
    libraryExport: 'default',
    library: 'Multiselect'
  },
  devtool: false,
  mode: 'production',
  module: {
  },
  plugins: [
    new webpack.optimize.AggressiveMergingPlugin()
  ]
});
