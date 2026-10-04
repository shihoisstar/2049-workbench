import { defineConfig, type UserConfigExport } from '@tarojs/cli';

import devConfig from './dev';
import prodConfig from './prod';

// designWidth=375 + NutUI 官方 deviceRatio(NutUI-React 以 375 为设计基准)
export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: '2049chupian',
    date: '2026-10-3',
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1.414 / 2,
      828: 1.81 / 2,
      375: 1,
    },
    sourceRoot: 'src',
    outputRoot: process.env.TARO_ENV === 'h5' ? 'dist/h5' : 'dist/weapp',
    plugins: [],
    framework: 'react',
    compiler: 'webpack5',
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: { enable: false },
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      // T3.2 踩坑:H5 默认代码分割把页面切进异步 chunk(780.js),运行时 chunk 映射
      // 缺失导致页面永不加载(白屏无报错)。页面体量小,关闭分割全量进 app.js。
      webpackChain(chain) {
        chain.optimization.splitChunks({});
      },
      postcss: {
        autoprefixer: { enable: true },
        cssModules: { enable: false },
      },
    },
  };
  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
