import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist 为构建产物；.publish 是公开仓导出目录，dist-demo 是其演示站产物，均不参与本地 lint
  globalIgnores(['dist', 'dist-demo', '.publish']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // 以下划线开头的变量/参数视为「有意丢弃」：典型用途是配合剩余参数剔除敏感字段，
      // 如 const { accessPasswordHash: _omit, ...rest } = family。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // 中文排版用全角空格（U+3000）分隔文案词组，属排版意图而非误粘贴：
      // 例如「谱序　·　源流」「郡望　颍川」。字符串内的全角空格本就默认放行，这里补放行 JSX 文本。
      'no-irregular-whitespace': ['error', { skipStrings: true, skipJSXText: true }],
    },
  },
  {
    // shadcn 生成件普遍同时导出组件与常量/变体，fast-refresh 的「只导出组件」边界要求无实际意义
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Provider 与配套 hook 同文件导出是有意设计（上下文不可拆分）；HMR 最坏降级为整页刷新，
    // 故降为提醒而不阻断 lint
    files: ['src/lib/*-context.tsx', 'src/components/ThemeModeProvider.tsx'],
    rules: { 'react-refresh/only-export-components': 'warn' },
  },
])
