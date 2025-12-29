import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/chunking.ts",
    "src/context.ts",
    "src/evaluation.ts",
    "src/glossary.ts",
    "src/html.ts",
    "src/markdown.ts",
    "src/prompt.ts",
    "src/refine.ts",
    "src/select.ts",
    "src/terms.ts",
    "src/tokens.ts",
    "src/tools.ts",
    "src/translate.ts",
    "src/window.ts",
  ],
  dts: true,
  format: ["esm", "cjs"],
  unbundle: true,
  platform: "neutral",
});
