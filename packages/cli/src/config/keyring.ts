import { Entry } from "@napi-rs/keyring";
import process from "node:process";
import { providerEnvVars, type ProviderName } from "./types.ts";

const SERVICE_NAME = "vertana";

/**
 * Gets the API key for a provider.
 * First checks the keyring, then falls back to environment variables.
 *
 * @param provider The provider name.
 * @returns The API key, or undefined if not found.
 */
export function getApiKey(provider: ProviderName): string | undefined {
  // First, try to get from keyring
  try {
    const entry = new Entry(SERVICE_NAME, provider);
    const password = entry.getPassword();
    if (password != null && password !== "") {
      return password;
    }
  } catch {
    // Keyring not available or entry not found, fall through to env var
  }

  // Fall back to environment variable
  const envVar = providerEnvVars[provider];
  const envValue = process.env[envVar];
  if (envValue != null && envValue !== "") {
    return envValue;
  }

  return undefined;
}

/**
 * Sets the API key for a provider in the keyring.
 *
 * @param provider The provider name.
 * @param apiKey The API key to store.
 * @throws {Error} If the keyring is not available.
 */
export function setApiKey(provider: ProviderName, apiKey: string): void {
  const entry = new Entry(SERVICE_NAME, provider);
  entry.setPassword(apiKey);
}

/**
 * Deletes the API key for a provider from the keyring.
 *
 * @param provider The provider name.
 * @throws {Error} If the keyring is not available.
 */
export function deleteApiKey(provider: ProviderName): void {
  const entry = new Entry(SERVICE_NAME, provider);
  entry.deletePassword();
}

/**
 * Checks if an API key exists for a provider.
 *
 * @param provider The provider name.
 * @returns True if an API key exists (in keyring or environment).
 */
export function hasApiKey(provider: ProviderName): boolean {
  return getApiKey(provider) != null;
}

/**
 * Masks an API key for display.
 *
 * @param apiKey The API key to mask.
 * @returns The masked API key (e.g., "sk-...xxxx").
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "****";
  }

  const prefix = apiKey.slice(0, 3);
  const suffix = apiKey.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Gets the masked API key for a provider (for display purposes).
 *
 * @param provider The provider name.
 * @returns The masked API key, or undefined if not found.
 */
export function getMaskedApiKey(provider: ProviderName): string | undefined {
  const apiKey = getApiKey(provider);
  if (apiKey == null) {
    return undefined;
  }
  return maskApiKey(apiKey);
}
