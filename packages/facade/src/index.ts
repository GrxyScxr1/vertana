import {
  type Chunk,
  type ContextResult,
  type ContextSource,
  countTokens,
  createHtmlChunker,
  createMarkdownChunker,
  extractTitle,
  type Glossary,
  type PassiveContextSource,
  refineChunks,
  translateChunks,
  type TranslateChunksComplete,
} from "@vertana/core";
import type { LanguageModel, ToolSet } from "ai";
import { convertToTools } from "./tools.ts";
import type {
  BestOfNOptions,
  DynamicGlossaryOptions,
  MediaType,
  TranslateOptions,
  Translation,
} from "./types.ts";

/**
 * Gathers context from all required context sources.
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
  DynamicGlossaryOptions,
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

export { extractTerms } from "@vertana/core";

/**
 * Gets the default chunker based on media type.
 */
function getDefaultChunker(mediaType?: MediaType) {
  if (mediaType === "text/html") {
    return createHtmlChunker();
  }
  return createMarkdownChunker();
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

  // 1. Normalize options
  const models = Array.isArray(model) ? model : [model];
  const primaryModel = models[0];

  const bestOfNOptions: BestOfNOptions | null =
    models.length > 1 && options?.bestOfN != null && options.bestOfN !== false
      ? options.bestOfN === true ? {} : options.bestOfN
      : null;

  const dynamicGlossaryOptions: DynamicGlossaryOptions | null =
    options?.dynamicGlossary != null && options.dynamicGlossary !== false
      ? options.dynamicGlossary === true ? {} : options.dynamicGlossary
      : null;

  // 2. Gather context from required sources
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

  const combinedContext = [options?.context, gatheredContext]
    .filter((c) => c != null && c.trim().length > 0)
    .join("\n\n");

  // 3. Chunk text (or use text as single chunk)
  const chunker = options?.chunker === null
    ? null
    : options?.chunker ?? getDefaultChunker(options?.mediaType);

  const maxTokens = options?.contextWindow?.type === "explicit"
    ? options.contextWindow.maxTokens
    : 4096;

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

  // 4. Prepare tools for passive sources
  const passiveSources = (options?.contextSources ?? []).filter(
    (s): s is PassiveContextSource<unknown> => s.mode === "passive",
  );

  let tools: ToolSet | undefined;
  if (passiveSources.length > 0) {
    options?.onProgress?.({ stage: "prompting", progress: 0 });
    tools = await convertToTools(passiveSources, options?.signal);
    options?.onProgress?.({ stage: "prompting", progress: 1 });
  }

  // Initial glossary from options
  const initialGlossary: Glossary = options?.glossary ?? [];

  // 5. Determine source chunks
  // If no chunks from chunker (chunker is null or text is small), use text as single chunk
  const sourceChunks = chunks.length > 0
    ? chunks.map((c) => c.content)
    : [text];
  const totalChunks = sourceChunks.length;

  // 6. Translate using translateChunks stream
  const modelsToUse = bestOfNOptions != null ? models : [primaryModel];

  options?.onProgress?.({
    stage: "translating",
    progress: 0,
    chunkIndex: 0,
    totalChunks,
  });

  let result: TranslateChunksComplete | undefined;
  let totalQualityScore = 0;
  let qualityScoreCount = 0;
  const modelWinCounts = new Map<LanguageModel, number>();

  for await (
    const event of translateChunks(sourceChunks, {
      targetLanguage,
      sourceLanguage: options?.sourceLanguage,
      title: options?.title,
      tone: options?.tone,
      domain: options?.domain,
      mediaType: options?.mediaType,
      context: combinedContext || undefined,
      glossary: initialGlossary,
      models: modelsToUse,
      evaluatorModel: bestOfNOptions?.evaluatorModel,
      dynamicGlossary: dynamicGlossaryOptions,
      tools,
      signal: options?.signal,
    })
  ) {
    if (event.type === "chunk") {
      options?.onProgress?.({
        stage: "translating",
        progress: (event.index + 1) / totalChunks,
        chunkIndex: event.index,
        totalChunks,
      });

      // Report selecting stage if best-of-N selection was used
      if (event.selectedModel != null) {
        options?.onProgress?.({
          stage: "selecting",
          progress: 1,
          totalCandidates: modelsToUse.length,
        });
      }

      if (event.qualityScore != null) {
        totalQualityScore += event.qualityScore;
        qualityScoreCount++;
      }
      if (event.selectedModel != null) {
        modelWinCounts.set(
          event.selectedModel,
          (modelWinCounts.get(event.selectedModel) ?? 0) + 1,
        );
      }
    } else {
      result = event;
    }
  }

  if (result == null) {
    throw new Error("Translation did not complete");
  }

  // Determine winning model
  let winningModel: LanguageModel | undefined;
  if (modelWinCounts.size > 0) {
    let maxWins = 0;
    for (const [m, wins] of modelWinCounts) {
      if (wins > maxWins) {
        maxWins = wins;
        winningModel = m;
      }
    }
  }

  let finalChunks = [...result.translations];
  let qualityScore = qualityScoreCount > 0
    ? totalQualityScore / qualityScoreCount
    : undefined;
  let refinementIterations: number | undefined;

  // 7. Apply refinement if enabled
  if (options?.refinement != null) {
    const maxIterations = options.refinement.maxIterations ?? 3;

    options?.onProgress?.({
      stage: "refining",
      progress: 0,
      maxIterations,
      totalChunks,
    });

    const refinementGlossary: Glossary = result.accumulatedGlossary.length > 0
      ? [...initialGlossary, ...result.accumulatedGlossary]
      : initialGlossary;

    const refineResult = await refineChunks(
      winningModel ?? primaryModel,
      sourceChunks,
      finalChunks,
      {
        targetLanguage,
        sourceLanguage: options?.sourceLanguage,
        targetScore: options.refinement.qualityThreshold ?? 0.85,
        maxIterations,
        glossary: refinementGlossary.length > 0
          ? refinementGlossary
          : undefined,
        evaluateBoundaries: totalChunks > 1,
        signal: options?.signal,
      },
    );

    finalChunks = [...refineResult.chunks];
    qualityScore = refineResult.scores.reduce((a, b) => a + b, 0) /
      refineResult.scores.length;
    refinementIterations = refineResult.totalIterations;

    options?.onProgress?.({
      stage: "refining",
      progress: 1,
      iteration: refinementIterations,
      maxIterations,
      totalChunks,
    });
  }

  // 8. Return result
  const processingTime = performance.now() - startTime;
  const combinedText = finalChunks.join("\n\n");

  return {
    text: combinedText,
    title: options?.title != null ? extractTitle(combinedText) : undefined,
    tokenUsed: result.totalTokensUsed,
    processingTime,
    qualityScore,
    refinementIterations,
    selectedModel: winningModel,
    accumulatedGlossary: result.accumulatedGlossary.length > 0
      ? result.accumulatedGlossary
      : undefined,
  };
}
