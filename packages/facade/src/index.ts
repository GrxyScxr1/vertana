import {
  type Candidate,
  type Chunk,
  type ContextResult,
  type ContextSource,
  countTokens,
  createHtmlChunker,
  createMarkdownChunker,
  type PassiveContextSource,
  refineChunks,
  selectBest,
} from "@vertana/core";
import {
  generateText,
  type LanguageModel,
  stepCountIs,
  type ToolSet,
} from "ai";
import { buildSystemPrompt, buildUserPrompt, extractTitle } from "./prompt.ts";
import { convertToTools } from "./tools.ts";
import type {
  BestOfNOptions,
  MediaType,
  TranslateOptions,
  Translation,
} from "./types.ts";

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
  BestOfNOptions,
  ChunkingProgress,
  GatheringContextProgress,
  MediaType,
  PromptingProgress,
  RefinementOptions,
  RefiningProgress,
  SelectingProgress,
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
function getDefaultChunker(mediaType?: MediaType) {
  if (mediaType === "text/html") {
    return createHtmlChunker();
  }
  // Use markdown chunker for markdown and plain text
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

  // Normalize models to array
  const models = Array.isArray(model) ? model : [model];

  // Determine if best-of-N selection should be used
  const bestOfNOptions: BestOfNOptions | null =
    models.length > 1 && options?.bestOfN != null && options.bestOfN !== false
      ? options.bestOfN === true ? {} : options.bestOfN
      : null;

  // When not using best-of-N, just use the first model
  const primaryModel = models[0];

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

    // Determine which models to use for translation
    const modelsToUse = bestOfNOptions != null ? models : [primaryModel];

    // Generate translations from all models in parallel
    const translationResults = await Promise.all(
      modelsToUse.map(async (modelToUse) => {
        const result = await generateText({
          model: modelToUse,
          system: systemPrompt,
          prompt: userPrompt,
          tools,
          stopWhen: passiveSources.length > 0 ? stepCountIs(10) : undefined,
          abortSignal: options?.signal,
        });
        return {
          text: result.text,
          metadata: modelToUse,
          tokensUsed: result.usage?.totalTokens ?? 0,
        };
      }),
    );

    const candidates: Array<Candidate<LanguageModel>> = translationResults.map(
      (r) => ({ text: r.text, metadata: r.metadata }),
    );
    const totalTokensUsed = translationResults.reduce(
      (sum, r) => sum + r.tokensUsed,
      0,
    );

    options?.onProgress?.({ stage: "translating", progress: 1 });

    // Select the best translation if best-of-N is enabled
    let translatedText: string;
    let winningModel: LanguageModel | undefined;
    let qualityScore: number | undefined;

    if (bestOfNOptions != null && candidates.length > 1) {
      options?.onProgress?.({
        stage: "selecting",
        progress: 0,
        totalCandidates: candidates.length,
      });

      const evaluatorModel = bestOfNOptions.evaluatorModel ?? primaryModel;

      const selectionResult = await selectBest(
        evaluatorModel,
        text,
        candidates,
        {
          targetLanguage,
          sourceLanguage: options?.sourceLanguage,
          glossary: options?.glossary,
          signal: options?.signal,
        },
      );

      translatedText = selectionResult.best.text;
      winningModel = selectionResult.best.metadata;
      qualityScore = selectionResult.best.score;

      options?.onProgress?.({
        stage: "selecting",
        progress: 1,
        totalCandidates: candidates.length,
      });
    } else {
      translatedText = candidates[0].text;
    }

    let refinementIterations: number | undefined;

    // Apply refinement if enabled
    if (options?.refinement != null) {
      options?.onProgress?.({ stage: "refining", progress: 0 });

      const refineResult = await refineChunks(
        winningModel ?? primaryModel,
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
      tokenUsed: totalTokensUsed,
      processingTime,
      qualityScore,
      refinementIterations,
      selectedModel: winningModel,
    };
  }

  // Determine which models to use for translation
  const modelsToUse = bestOfNOptions != null ? models : [primaryModel];
  const evaluatorModel = bestOfNOptions?.evaluatorModel ?? primaryModel;
  const useBestOfN = bestOfNOptions != null && modelsToUse.length > 1;

  // Process chunks sequentially, with parallel model translation per chunk
  let finalChunks: string[] = [];
  let totalTokensUsed = 0;
  let totalQualityScore = 0;
  const modelWinCounts = new Map<LanguageModel, number>();

  for (let i = 0; i < chunks.length; i++) {
    options?.signal?.throwIfAborted();

    options?.onProgress?.({
      stage: "translating",
      progress: i / chunks.length,
      chunkIndex: i,
      totalChunks: chunks.length,
    });

    // Translate current chunk with all models in parallel
    const chunkResults = await Promise.all(
      modelsToUse.map(async (model) => {
        const result = await translateChunk(
          model,
          systemPrompt,
          chunks[i].content,
          tools,
          passiveSources.length > 0,
          options?.signal,
        );
        return { model, ...result };
      }),
    );

    // Sum up tokens used
    for (const result of chunkResults) {
      totalTokensUsed += result.tokenUsed;
    }

    // Select best translation for this chunk if best-of-N is enabled
    if (useBestOfN) {
      const candidates: Array<Candidate<LanguageModel>> = chunkResults.map(
        (r) => ({ text: r.text, metadata: r.model }),
      );

      const selectionResult = await selectBest(
        evaluatorModel,
        chunks[i].content,
        candidates,
        {
          targetLanguage,
          sourceLanguage: options?.sourceLanguage,
          glossary: options?.glossary,
          signal: options?.signal,
        },
      );

      finalChunks.push(selectionResult.best.text);
      totalQualityScore += selectionResult.best.score;

      // Track winning model for this chunk
      const chunkWinner = selectionResult.best.metadata;
      if (chunkWinner != null) {
        modelWinCounts.set(
          chunkWinner,
          (modelWinCounts.get(chunkWinner) ?? 0) + 1,
        );
      }
    } else {
      finalChunks.push(chunkResults[0].text);
    }
  }

  options?.onProgress?.({
    stage: "translating",
    progress: 1,
    chunkIndex: chunks.length,
    totalChunks: chunks.length,
  });

  // Determine the most frequently winning model
  let winningModel: LanguageModel | undefined;
  let qualityScore: number | undefined;

  if (useBestOfN) {
    let maxWins = 0;
    for (const [model, wins] of modelWinCounts) {
      if (wins > maxWins) {
        maxWins = wins;
        winningModel = model;
      }
    }
    qualityScore = totalQualityScore / chunks.length;
  }
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
      winningModel ?? primaryModel,
      originalChunks,
      finalChunks,
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
    selectedModel: winningModel,
  };
}
