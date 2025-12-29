/**
 * Configuration for the Vertana CLI.
 */
export interface VertanaConfig {
  /**
   * The default model to use for translation.
   * Format: "provider:model" (e.g., "openai:gpt-4o").
   */
  readonly model?: string;
}

/**
 * The default configuration.
 */
export const defaultConfig: VertanaConfig = {};

/**
 * Supported provider names.
 */
export type ProviderName = "openai" | "anthropic" | "google";

/**
 * List of supported provider names.
 */
export const providerNames: readonly ProviderName[] = [
  "openai",
  "anthropic",
  "google",
];

/**
 * Environment variable names for API keys by provider.
 */
export const providerEnvVars: Record<ProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/**
 * Checks if a string is a valid provider name.
 *
 * @param provider The string to check.
 * @returns True if the string is a valid provider name.
 */
export function isProviderName(provider: string): provider is ProviderName {
  return provider === "openai" || provider === "anthropic" ||
    provider === "google";
}
