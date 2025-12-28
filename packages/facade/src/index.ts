import { generateText, type LanguageModel } from "ai";
import { buildSystemPrompt, buildUserPrompt, extractTitle } from "./prompt.ts";
import type { TranslateOptions, Translation } from "./types.ts";

export type {
  MediaType,
  RefinementOptions,
  TranslateOptions,
  Translation,
  TranslationProgress,
  TranslationTone,
} from "./types.ts";

/**
 * Translates the given text to the specified target language using the provided
 * language model(s).
 *
 * @param model The language model or models to use for translation.
 *              If multiple models are provided, they will be used for
 *              best-of-N selection.
 * @param targetLanguage The target language for the translation.  This can be
 *                       specified as an `Intl.Locale` object or a BCP 47
 *                       language tag string.
 * @param text The text to be translated.
 * @param options Optional settings for the translation process.
 * @returns A promise that resolves to the translation result.
 */
export async function translate(
  model: LanguageModel | readonly LanguageModel[],
  targetLanguage: Intl.Locale | string,
  text: string,
  options?: TranslateOptions,
): Promise<Translation> {
  const startTime = performance.now();

  // For now, use the first model if multiple are provided
  const selectedModel = Array.isArray(model) ? model[0] : model;

  // Build the system prompt
  const systemPrompt = buildSystemPrompt(targetLanguage, {
    sourceLanguage: options?.sourceLanguage,
    tone: options?.tone,
    domain: options?.domain,
    mediaType: options?.mediaType,
    context: options?.context,
    glossary: options?.glossary,
  });

  // Build the user prompt
  const userPrompt = buildUserPrompt(text, options?.title);

  // Report progress: translating
  options?.onProgress?.({ stage: "translating", progress: 0 });

  // Generate the translation
  const result = await generateText({
    model: selectedModel,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: options?.signal,
  });

  // Report progress: complete
  options?.onProgress?.({ stage: "translating", progress: 1 });

  const processingTime = performance.now() - startTime;
  const tokenUsed = result.usage?.totalTokens ?? 0;

  return {
    text: result.text,
    title: options?.title != null ? extractTitle(result.text) : undefined,
    tokenUsed,
    processingTime,
  };
}
