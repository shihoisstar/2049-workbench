import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';

// 显式注入 TARO_APP_* 环境变量(Taro 内建 .env 机制在本工程未生效,2026-10-05 实测):
// .env 为基底,.env.[mode] 覆盖;变量在业务代码以 process.env.TARO_APP_* 使用(编译期替换)。
function loadAppEnv(): Record<string, string> {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const out: Record<string, string> = {};
  for (const f of ['.env', `.env.${mode}`]) {
    try {
      for (const line of readFileSync(resolve(__dirname, f), 'utf8').split('\n')) {
        const m = line.match(/^(TARO_APP_[A-Z_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim();
      }
    } catch { /* 文件不存在跳过 */ }
  }
  return out;
}
const APP_ENV = loadAppEnv();

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
    defineConstants: Object.fromEntries(
      Object.entries(APP_ENV).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]),
    ),
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
        // 产物加内容哈希:配合 Caddy no-cache,更新即换名,浏览器缓存不再咬人
        chain.output.filename('[name].[contenthash:8].js');
        chain.output.chunkFilename('[name].[contenthash:8].js');
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
