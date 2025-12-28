import { type Chunk, countTokens, createMarkdownChunker } from "@vertana/core";
import { generateText, type LanguageModel } from "ai";
import { buildSystemPrompt, buildUserPrompt, extractTitle } from "./prompt.ts";
import type { MediaType, TranslateOptions, Translation } from "./types.ts";

export type {
  ChunkingProgress,
  GatheringContextProgress,
  MediaType,
  PromptingProgress,
  RefinementOptions,
  TranslateOptions,
  TranslatingProgress,
  Translation,
  TranslationProgress,
  TranslationTone,
} from "./types.ts";

/**
 * Gets the default chunker based on media type.
 *
 * @param mediaType The media type of the content.
 * @returns The appropriate chunker for the media type.
 */
function getDefaultChunker(_mediaType?: MediaType) {
  // For now, use markdown chunker for all types
  // TODO: Add specialized chunkers for other media types
  return createMarkdownChunker();
}

/**
 * Translates a single chunk of text.
 *
 * @param model The language model to use.
 * @param systemPrompt The system prompt.
 * @param text The text to translate.
 * @param signal Optional abort signal.
 * @returns The translation result.
 */
async function translateChunk(
  model: LanguageModel,
  systemPrompt: string,
  text: string,
  signal?: AbortSignal,
): Promise<{ text: string; tokenUsed: number }> {
  const userPrompt = buildUserPrompt(text);
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  });
  return {
    text: result.text,
    tokenUsed: result.usage?.totalTokens ?? 0,
  };
}

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

  // Determine the chunker to use
  const chunker = options?.chunker === null
    ? null
    : options?.chunker ?? getDefaultChunker(options?.mediaType);

  // Get max tokens from context window (default 4096 for chunking)
  const maxTokens = options?.contextWindow?.type === "explicit"
    ? options.contextWindow.maxTokens
    : 4096;

  // Check if chunking is needed
  let chunks: readonly Chunk[] = [];
  if (chunker != null) {
    options?.onProgress?.({ stage: "chunking", progress: 0 });
    chunks = await chunker(text, {
      maxTokens,
      countTokens,
      signal: options?.signal,
    });
    options?.onProgress?.({ stage: "chunking", progress: 1 });
  }

  // If no chunking or single chunk, translate directly
  if (chunks.length <= 1) {
    const userPrompt = buildUserPrompt(text, options?.title);
    options?.onProgress?.({ stage: "translating", progress: 0 });

    const result = await generateText({
      model: selectedModel,
      system: systemPrompt,
      prompt: userPrompt,
      abortSignal: options?.signal,
    });

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

  // Translate each chunk
  const translatedChunks: string[] = [];
  let totalTokensUsed = 0;

  for (let i = 0; i < chunks.length; i++) {
    options?.signal?.throwIfAborted();

    options?.onProgress?.({
      stage: "translating",
      progress: i / chunks.length,
      chunkIndex: i,
      totalChunks: chunks.length,
    });

    const chunkResult = await translateChunk(
      selectedModel,
      systemPrompt,
      chunks[i].content,
      options?.signal,
    );

    translatedChunks.push(chunkResult.text);
    totalTokensUsed += chunkResult.tokenUsed;
  }

  options?.onProgress?.({
    stage: "translating",
    progress: 1,
    chunkIndex: chunks.length,
    totalChunks: chunks.length,
  });

  const processingTime = performance.now() - startTime;

  // Combine translated chunks
  const combinedText = translatedChunks.join("\n\n");

  return {
    text: combinedText,
    title: options?.title != null ? extractTitle(combinedText) : undefined,
    tokenUsed: totalTokensUsed,
    processingTime,
  };
}
