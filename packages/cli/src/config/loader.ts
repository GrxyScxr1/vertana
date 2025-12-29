import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { defaultConfig, type VertanaConfig } from "./types.ts";

/**
 * Gets the configuration directory path following XDG Base Directory specification.
 *
 * @returns The configuration directory path.
 */
export function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig != null && xdgConfig !== "") {
    return join(xdgConfig, "vertana");
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData != null && appData !== "") {
      return join(appData, "vertana");
    }
  }

  return join(homedir(), ".config", "vertana");
}

/**
 * Gets the configuration file path.
 *
 * @returns The configuration file path.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

/**
 * Loads the configuration from the config file.
 *
 * @returns The loaded configuration, or the default configuration if the file
 *          does not exist.
 */
export function loadConfig(): VertanaConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...defaultConfig };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return { ...defaultConfig };
    }

    const config = parsed as Record<string, unknown>;
    return {
      model: typeof config.model === "string" ? config.model : undefined,
    };
  } catch {
    return { ...defaultConfig };
  }
}

/**
 * Saves the configuration to the config file.
 *
 * @param config The configuration to save.
 */
export function saveConfig(config: VertanaConfig): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const content = JSON.stringify(config, null, 2) + "\n";
  writeFileSync(configPath, content, "utf-8");
}

/**
 * Updates a specific configuration value.
 *
 * @param key The configuration key to update.
 * @param value The new value.
 */
export function updateConfig<K extends keyof VertanaConfig>(
  key: K,
  value: VertanaConfig[K],
): void {
  const config = loadConfig();
  const newConfig: VertanaConfig = { ...config, [key]: value };
  saveConfig(newConfig);
}
