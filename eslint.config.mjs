import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Flat ESLint config.
 *
 * `eslint-config-next` v16 ships native flat configs (no `FlatCompat` shim), so
 * the two rule sets are spread directly.
 */
const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"],
  },
];

export default config;