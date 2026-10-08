import { defineConfig } from "oxfmt"

export default defineConfig({
  printWidth: 100,
  tabWidth: 2,
  semi: false,
  trailingComma: "all",
  ignorePatterns: [".agents/**", "docs/**", "package.json"],
  singleQuote: false,
  sortImports: true,
  sortTailwindcss: true,
  sortPackageJson: true,
})
