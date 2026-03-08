import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import jsdoc from "eslint-plugin-jsdoc";
import tsdoc from "eslint-plugin-tsdoc";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    name: "custom-rules",
    plugins: {
      "@typescript-eslint": tseslint,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-restricted-imports": [
        "error",
        {
          patterns: ["../*../*"], // 防止层级过深的相对路径，优先使用 @/*
        },
      ],
      "import/no-cycle": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/components/**", "src/hooks/**"],
    name: "documentation-syntax",
    plugins: {
      tsdoc,
    },
    rules: {
      "tsdoc/syntax": "warn",
    },
  },
  {
    files: ["src/lib/services/**/*.ts", "src/app/api/**/*.ts"],
    name: "documentation-coverage",
    plugins: {
      jsdoc,
    },
    rules: {
      "jsdoc/require-jsdoc": [
        "warn",
        {
          enableFixer: false,
          publicOnly: {
            ancestorsOnly: true,
            esm: true,
          },
          require: {
            ArrowFunctionExpression: false,
            ClassDeclaration: true,
            ClassExpression: false,
            FunctionDeclaration: true,
            FunctionExpression: false,
            MethodDefinition: false,
          },
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    name: "test-rules",
    plugins: {
      "@typescript-eslint": tseslint,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    ".auto-claude/**", // Ignore auto-claude worktrees
  ]),
]);
