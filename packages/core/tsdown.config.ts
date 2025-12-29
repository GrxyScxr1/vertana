import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/chunking.ts",
    "src/context.ts",
    "src/evaluation.ts",
    "src/glossary.ts",
    "src/markdown.ts",
    "src/refine.ts",
    "src/select.ts",
    "src/tokens.ts",
    "src/window.ts",
  ],
  dts: true,
  format: ["esm", "cjs"],
  unbundle: true,
  platform: "neutral",
});
