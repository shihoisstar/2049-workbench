// ESLint 9 flat config —— JS 基线 + TS 语法级规则;类型级检查归 typecheck(tsc),不在此重复。
// 注意:T0.2 Taro 初始化后如与编译产物冲突,按包加 ignores,不放松规则。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
