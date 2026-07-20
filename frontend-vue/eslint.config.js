// ESLint flat config for this Nuxt 3 + Vue 3 + TypeScript project.
//
// Uses the official @nuxt/eslint module (registered in nuxt.config.ts),
// which auto-detects Nuxt's generated types/aliases and composes
// eslint-plugin-vue + typescript-eslint with Nuxt-aware recommended rules.
// `withNuxt()` reads the config generated at `.nuxt/eslint.config.mjs`
// (produced by `nuxt prepare`).
//
// Scope: this only wires up linting with recommended rule sets. It
// intentionally does NOT attempt to fix the pre-existing lint violations
// already present in this codebase, and it is NOT wired into any
// CI/build/pre-commit gate — run it manually via `pnpm lint`
// (or `npx eslint .`).
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['dist', '.output', 'coverage'],
  }
)
