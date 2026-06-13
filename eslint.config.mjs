import next from "eslint-config-next";

/**
 * Next.js 16 ships `eslint-config-next` as a native flat-config array (it bundles
 * core-web-vitals + typescript), so we spread it directly. The previous
 * `FlatCompat().extends("next/...")` shim is incompatible with the v16 flat config
 * (it throws a circular-structure error during config validation).
 */
const eslintConfig = [
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "target/**",
      "rtk/**",
      "src/generated/**",
      "next-env.d.ts",
    ],
  },
  {
    // Scoped to TS files: the `@typescript-eslint` plugin is only registered for
    // these in eslint-config-next's flat config.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
