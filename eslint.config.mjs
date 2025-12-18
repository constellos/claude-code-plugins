import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const config = [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "dist/*",
      "node_modules/*",
      "!.claude/*",
    ],
  },
  {
    files: ["bin/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: [".claude/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

export default config;
