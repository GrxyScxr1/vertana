import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
  ],
  dts: true,
  format: ["esm", "cjs"],
  platform: "node",
  banner: {
    js: "#!/usr/bin/env node",
  },
  inputOptions: {
    onLog(level, log, defaultHandler) {
      if (
        level === "warn" && log.code === "EMPTY_IMPORT_META" &&
        log.id.endsWith("/src/index.ts")
      ) {
        return;
      }
      defaultHandler(level, log);
    }
  }
});
