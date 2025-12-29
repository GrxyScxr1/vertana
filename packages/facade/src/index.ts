import {
  type Chunk,
  type ContextResult,
  type ContextSource,
  countTokens,
  createMarkdownChunker,
  type PassiveContextSource,
  refineChunks,
} from "@vertana/core";
import {
  generateText,
  type LanguageModel,
  stepCountIs,
  type ToolSet,
} from "ai";
import { buildSystemPrompt, buildUserPrompt, extractTitle } from "./prompt.ts";
import { convertToTools } from "./tools.ts";
import type { MediaType, TranslateOptions, Translation } from "./types.ts";

/**
 * Gathers context from all required context sources.
 *
 * @param sources The context sources to gather from.
 * @param signal Optional abort signal.
 * @returns The gathered context results.
 */
async function gatherRequiredContext(
  sources: readonly ContextSource[],
  signal?: AbortSignal,
): Promise<readonly ContextResult[]> {
  const requiredSources = sources.filter((s) => s.mode === "required");
  if (requiredSources.length === 0) {
    return [];
  }

  const results: ContextResult[] = [];
  for (const source of requiredSources) {
    signal?.throwIfAborted();
    const result = await source.gather({ signal });
    results.push(result);
  }
  return results;
}

/**
 * Combines gathered context results into a single string.
 *
 * @param results The context results to combine.
 * @returns The combined context string.
 */
function combineContextResults(results: readonly ContextResult[]): string {
  return results
    .map((r) => r.content)
    .filter((c) => c.trim().length > 0)
    .join("\n\n");
}

export type {
  ChunkingProgress,
  GatheringContextProgress,
  MediaType,
  PromptingProgress,
  RefinementOptions,
  RefiningProgress,
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
 * @param tools Optional tools for passive context sources.
 * @param hasPassiveSources Whether passive sources are present.
 * @param signal Optional abort signal.
 * @returns The translation result.
 */
async function translateChunk(
  model: LanguageModel,
  systemPrompt: string,
  text: string,
  tools?: ToolSet,
  hasPassiveSources?: boolean,
  signal?: AbortSignal,
): Promise<{ text: string; tokenUsed: number }> {
  const userPrompt = buildUserPrompt(text);
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    tools,
    stopWhen: hasPassiveSources ? stepCountIs(10) : undefined,
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

  // Gather context from required sources
  let gatheredContext = "";
  if (options?.contextSources != null && options.contextSources.length > 0) {
    options?.onProgress?.({ stage: "gatheringContext", progress: 0 });
    const contextResults = await gatherRequiredContext(
      options.contextSources,
      options?.signal,
    );
    gatheredContext = combineContextResults(contextResults);
    options?.onProgress?.({ stage: "gatheringContext", progress: 1 });
  }

  // Combine gathered context with user-provided context
  const combinedContext = [options?.context, gatheredContext]
    .filter((c) => c != null && c.trim().length > 0)
    .join("\n\n");

  // Build the system prompt
  const systemPrompt = buildSystemPrompt(targetLanguage, {
    sourceLanguage: options?.sourceLanguage,
    tone: options?.tone,
    domain: options?.domain,
    mediaType: options?.mediaType,
    context: combinedContext || undefined,
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

  // Extract passive sources for tool calling
  const passiveSources = (options?.contextSources ?? []).filter(
    (s): s is PassiveContextSource<unknown> => s.mode === "passive",
  );

  // Convert passive sources to AI SDK tools if any exist
  let tools: ToolSet | undefined;
  if (passiveSources.length > 0) {
    options?.onProgress?.({ stage: "prompting", progress: 0 });
    tools = await convertToTools(passiveSources, options?.signal);
    options?.onProgress?.({ stage: "prompting", progress: 1 });
  }

  // If no chunking or single chunk, translate directly
  if (chunks.length <= 1) {
    const userPrompt = buildUserPrompt(text, options?.title);
    options?.onProgress?.({ stage: "translating", progress: 0 });

    const result = await generateText({
      model: selectedModel,
      system: systemPrompt,
      prompt: userPrompt,
      tools,
      stopWhen: passiveSources.length > 0 ? stepCountIs(10) : undefined,
      abortSignal: options?.signal,
    });

    options?.onProgress?.({ stage: "translating", progress: 1 });

    let translatedText = result.text;
    const tokenUsed = result.usage?.totalTokens ?? 0;
    let qualityScore: number | undefined;
    let refinementIterations: number | undefined;

    // Apply refinement if enabled
    if (options?.refinement != null) {
      options?.onProgress?.({ stage: "refining", progress: 0 });

      const refineResult = await refineChunks(
        selectedModel,
        [text],
        [translatedText],
        {
          targetLanguage,
          sourceLanguage: options?.sourceLanguage,
          targetScore: options.refinement.qualityThreshold ?? 0.85,
          maxIterations: options.refinement.maxIterations ?? 3,
          glossary: options?.glossary,
          evaluateBoundaries: false,
          signal: options?.signal,
        },
      );

      translatedText = refineResult.chunks[0];
      qualityScore = refineResult.scores[0];
      refinementIterations = refineResult.totalIterations;

      options?.onProgress?.({ stage: "refining", progress: 1 });
    }

    const processingTime = performance.now() - startTime;

    return {
      text: translatedText,
      title: options?.title != null ? extractTitle(translatedText) : undefined,
      tokenUsed,
      processingTime,
      qualityScore,
      refinementIterations,
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
      tools,
      passiveSources.length > 0,
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

  let finalChunks = translatedChunks;
  let qualityScore: number | undefined;
  let refinementIterations: number | undefined;

  // Apply refinement if enabled
  if (options?.refinement != null) {
    const originalChunks = chunks.map((c) => c.content);
    const maxIterations = options.refinement.maxIterations ?? 3;

    options?.onProgress?.({
      stage: "refining",
      progress: 0,
      maxIterations,
      totalChunks: chunks.length,
    });

    const refineResult = await refineChunks(
      selectedModel,
      originalChunks,
      translatedChunks,
      {
        targetLanguage,
        sourceLanguage: options?.sourceLanguage,
        targetScore: options.refinement.qualityThreshold ?? 0.85,
        maxIterations,
        glossary: options?.glossary,
        evaluateBoundaries: true,
        signal: options?.signal,
      },
    );

    finalChunks = [...refineResult.chunks];
    // Average score across all chunks
    qualityScore = refineResult.scores.reduce((a, b) => a + b, 0) /
      refineResult.scores.length;
    refinementIterations = refineResult.totalIterations;

    options?.onProgress?.({
      stage: "refining",
      progress: 1,
      iteration: refinementIterations,
      maxIterations,
      totalChunks: chunks.length,
    });
  }

  const processingTime = performance.now() - startTime;

  // Combine translated chunks
  const combinedText = finalChunks.join("\n\n");

  return {
    text: combinedText,
    title: options?.title != null ? extractTitle(combinedText) : undefined,
    tokenUsed: totalTokensUsed,
    processingTime,
    qualityScore,
    refinementIterations,
  };
}
