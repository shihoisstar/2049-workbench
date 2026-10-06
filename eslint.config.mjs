// ESLint 9 flat config —— JS 基线 + TS 语法级规则;类型级检查归 typecheck(tsc),不在此重复。
// 注意:T0.2 Taro 初始化后如与编译产物冲突,按包加 ignores,不放松规则。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.mjs', '**/scripts/**'] }, // scripts/ = Node CLI/运维脚本(CJS require 正常写法)
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 桩函数/预留参数用 _ 前缀豁免(工程约定)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node CJS 配置文件(babel.config.js 等)的内置全局
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
);
