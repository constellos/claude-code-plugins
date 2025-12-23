/**
 * ESLint configuration for TSDoc validation
 *
 * This configuration enforces TSDoc 2025 best practices on TypeScript files,
 * ensuring comprehensive documentation for all exported members. Used by the
 * tsdoc-validate.ts hook to provide real-time feedback to Claude.
 *
 * @module eslint.tsdoc.config
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

const config = [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  jsdoc.configs['flat/recommended-typescript'],
  {
    files: ['**/*.ts'],
    plugins: { jsdoc },
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
    rules: {
      // Require JSDoc on all exported declarations
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
          contexts: [
            'ExportNamedDeclaration[declaration.type="FunctionDeclaration"]',
            'ExportNamedDeclaration[declaration.type="VariableDeclaration"]',
          ],
        },
      ],

      // Require @param tags with descriptions for all parameters
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-param-type': 'off', // TypeScript handles types

      // Require @returns tags with descriptions
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/require-returns-type': 'off', // TypeScript handles types

      // Encourage @example blocks (warn for gradual adoption)
      'jsdoc/require-example': 'warn',

      // Require description text
      'jsdoc/require-description': 'error',

      // Enforce multiline format (no single-line blocks for public exports)
      'jsdoc/multiline-blocks': [
        'error',
        {
          noSingleLineBlocks: true,
        },
      ],

      // Check formatting and alignment
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-indentation': 'error',
      'jsdoc/check-syntax': 'error',

      // Validate tag names
      'jsdoc/check-tag-names': 'error',

      // TypeScript-specific: don't require types in JSDoc
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-property-type': 'off',

      // Allow module tags without description (they're just identifiers)
      'jsdoc/require-description-complete-sentence': 'off',
    },
  },
];

export default config;
