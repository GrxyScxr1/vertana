import process from "node:process";
import type { LanguageModel } from "ai";

/**
 * Supported provider names for testing.
 */
export type ProviderName = "openai" | "anthropic" | "google";

/**
 * Creates a language model from a model string in the format "provider:model".
 *
 * @param modelString The model string (e.g., "openai:gpt-4o-mini").
 * @returns The language model instance.
 * @throws If the provider is not supported or the format is invalid.
 *
 * @example
 * ```typescript
 * const model = await createModelFromString("openai:gpt-4o-mini");
 * const model = await createModelFromString("anthropic:claude-3-haiku-20240307");
 * const model = await createModelFromString("google:gemini-1.5-flash");
 * ```
 */
export async function createModelFromString(
  modelString: string,
): Promise<LanguageModel> {
  const colonIndex = modelString.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      `Invalid model string format: "${modelString}". ` +
        'Expected format: "provider:model" (e.g., "openai:gpt-4o-mini")',
    );
  }

  const provider = modelString.slice(0, colonIndex) as ProviderName;
  const modelId = modelString.slice(colonIndex + 1);

  if (modelId === "") {
    throw new Error(
      `Invalid model string format: "${modelString}". ` +
        "Model ID cannot be empty.",
    );
  }

  switch (provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({});
      return openai(modelId);
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic({});
      return anthropic(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({});
      return google(modelId);
    }
    default:
      throw new Error(
        `Unsupported provider: "${provider}". ` +
          'Supported providers: "openai", "anthropic", "google"',
      );
  }
}

/**
 * Gets the test model from the TEST_MODEL environment variable.
 *
 * @returns A promise that resolves to the language model instance,
 *          or undefined if TEST_MODEL is not set.
 */
export async function getTestModel(): Promise<LanguageModel | undefined> {
  const modelString = process.env.TEST_MODEL;
  if (modelString == null) {
    return undefined;
  }
  return await createModelFromString(modelString);
}

/**
 * Checks if the TEST_MODEL environment variable is set.
 * This is useful for conditionally skipping tests synchronously.
 *
 * @returns True if TEST_MODEL is set, false otherwise.
 */
export function hasTestModel(): boolean {
  return process.env.TEST_MODEL != null;
}
