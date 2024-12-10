import eslintJs from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

import globals from 'globals';
import eslintTs from 'typescript-eslint';

const tsFiles = ['{src,lib}/**/*.{ts,tsx}'];

const languageOptions = {
  globals: {
    ...globals.node,
    ...globals.jest,
  },
  ecmaVersion: 2023,
  sourceType: 'module',
};

const rules = {
  '@typescript-eslint/no-use-before-define': 'off',
  'require-await': 'off',
  'no-duplicate-imports': 'error',
  'no-unneeded-ternary': 'error',
  'prefer-object-spread': 'error',
  '@typescript-eslint/array-type': 'off',
  '@typescript-eslint/ban-ts-comment': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      ignoreRestSiblings: true,
      args: 'none',
    },
  ],
};

const commonIgnores = [
  'node_modules',
  '**/node_modules',
  '**/dist/*',
  'docs/*',
  'build/*',
  'dist/*',
  'next.config.mjs',
];

const customTypescriptConfig = {
  files: tsFiles,
  plugins: {
    'import/parsers': tsParser,
  },
  languageOptions: {
    ...languageOptions,
    parser: tsParser,
    parserOptions: {
      project: './tsconfig.json',
      sourceType: 'module',
    },
  },
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts'],
    },
  },
  rules: {

    ...rules,
  },
  ignores: commonIgnores,
};

// Add the files for applying the recommended TypeScript configs
// only for the Typescript files.
// This is necessary when we have the multiple extensions files
// (e.g. .ts, .tsx, .js, .cjs, .mjs, etc.).
const recommendedTypeScriptConfigs = [
  ...eslintTs.configs.recommended.map((config) => ({
    ...config,
    files: tsFiles,
    rules: {
      ...config.rules,
      ...rules,
    },
    ignores: commonIgnores,
  })),
  ...eslintTs.configs.stylistic.map((config) => ({
    ...config,
    files: tsFiles,
    rules: {
      ...config.rules,
      ...rules,
    },
    ignores: commonIgnores,
  })),
];

export default [...recommendedTypeScriptConfigs, customTypescriptConfig];
