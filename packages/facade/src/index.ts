import {
  buildSystemPrompt,
  buildUserPrompt,
  type Candidate,
  type Chunk,
  type ContextResult,
  type ContextSource,
  countTokens,
  createHtmlChunker,
  createMarkdownChunker,
  extractTerms,
  extractTitle,
  type Glossary,
  type GlossaryEntry,
  type PassiveContextSource,
  refineChunks,
  selectBest,
  translateChunks,
  type TranslateChunksComplete,
} from "@vertana/core";
import {
  generateText,
  type LanguageModel,
  stepCountIs,
  type ToolSet,
} from "ai";
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

  // 3. Chunk text
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

  // 5. Single-chunk path (handles title specially)
  if (chunks.length <= 1) {
    return translateSingleChunk(
      models,
      targetLanguage,
      text,
      {
        ...options,
        context: combinedContext || undefined,
        glossary: initialGlossary,
        tools,
        passiveSources,
        bestOfNOptions,
        dynamicGlossaryOptions,
        startTime,
      },
    );
  }

  // 6. Multi-chunk path using translateChunks stream
  const sourceChunks = chunks.map((c) => c.content);
  const modelsToUse = bestOfNOptions != null ? models : [primaryModel];

  options?.onProgress?.({
    stage: "translating",
    progress: 0,
    chunkIndex: 0,
    totalChunks: chunks.length,
  });

  let result: TranslateChunksComplete | undefined;
  let totalQualityScore = 0;
  let qualityScoreCount = 0;
  const modelWinCounts = new Map<LanguageModel, number>();

  for await (
    const event of translateChunks(sourceChunks, {
      targetLanguage,
      sourceLanguage: options?.sourceLanguage,
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
        progress: (event.index + 1) / chunks.length,
        chunkIndex: event.index,
        totalChunks: chunks.length,
      });

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
      totalChunks: chunks.length,
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
        evaluateBoundaries: true,
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
      totalChunks: chunks.length,
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

/**
 * Internal options for single-chunk translation.
 */
interface SingleChunkOptions extends TranslateOptions {
  readonly tools?: ToolSet;
  readonly passiveSources: readonly PassiveContextSource<unknown>[];
  readonly bestOfNOptions: BestOfNOptions | null;
  readonly dynamicGlossaryOptions: DynamicGlossaryOptions | null;
  readonly startTime: number;
}

/**
 * Handles single-chunk translation with title support.
 */
async function translateSingleChunk(
  models: readonly LanguageModel[],
  targetLanguage: Intl.Locale | string,
  text: string,
  options: SingleChunkOptions,
): Promise<Translation> {
  const {
    tools,
    passiveSources,
    bestOfNOptions,
    dynamicGlossaryOptions,
    startTime,
    ...translateOptions
  } = options;

  const primaryModel = models[0];
  const initialGlossary: Glossary = translateOptions.glossary ?? [];

  const systemPrompt = buildSystemPrompt(targetLanguage, {
    sourceLanguage: translateOptions.sourceLanguage,
    tone: translateOptions.tone,
    domain: translateOptions.domain,
    mediaType: translateOptions.mediaType,
    context: translateOptions.context,
    glossary: initialGlossary.length > 0 ? initialGlossary : undefined,
  });

  const userPrompt = buildUserPrompt(text, translateOptions.title);
  translateOptions.onProgress?.({ stage: "translating", progress: 0 });

  // Determine which models to use
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
        abortSignal: translateOptions.signal,
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

  translateOptions.onProgress?.({ stage: "translating", progress: 1 });

  // Select the best translation if best-of-N is enabled
  let translatedText: string;
  let winningModel: LanguageModel | undefined;
  let qualityScore: number | undefined;

  if (bestOfNOptions != null && candidates.length > 1) {
    translateOptions.onProgress?.({
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
        sourceLanguage: translateOptions.sourceLanguage,
        glossary: initialGlossary.length > 0 ? initialGlossary : undefined,
        signal: translateOptions.signal,
      },
    );

    translatedText = selectionResult.best.text;
    winningModel = selectionResult.best.metadata;
    qualityScore = selectionResult.best.score;

    translateOptions.onProgress?.({
      stage: "selecting",
      progress: 1,
      totalCandidates: candidates.length,
    });
  } else {
    translatedText = candidates[0].text;
  }

  let refinementIterations: number | undefined;

  // Apply refinement if enabled
  if (translateOptions.refinement != null) {
    translateOptions.onProgress?.({ stage: "refining", progress: 0 });

    const refineResult = await refineChunks(
      winningModel ?? primaryModel,
      [text],
      [translatedText],
      {
        targetLanguage,
        sourceLanguage: translateOptions.sourceLanguage,
        targetScore: translateOptions.refinement.qualityThreshold ?? 0.85,
        maxIterations: translateOptions.refinement.maxIterations ?? 3,
        glossary: initialGlossary.length > 0 ? initialGlossary : undefined,
        evaluateBoundaries: false,
        signal: translateOptions.signal,
      },
    );

    translatedText = refineResult.chunks[0];
    qualityScore = refineResult.scores[0];
    refinementIterations = refineResult.totalIterations;

    translateOptions.onProgress?.({ stage: "refining", progress: 1 });
  }

  // Extract terms for dynamic glossary
  const accumulatedGlossary: GlossaryEntry[] = [];
  if (dynamicGlossaryOptions != null) {
    const extractorModel = dynamicGlossaryOptions.extractorModel ??
      primaryModel;
    const maxTermsPerChunk = dynamicGlossaryOptions.maxTermsPerChunk ?? 10;
    const extractedTerms = await extractTerms(
      extractorModel,
      text,
      translatedText,
      {
        maxTerms: maxTermsPerChunk,
        signal: translateOptions.signal,
      },
    );

    for (const term of extractedTerms) {
      const isDuplicate = accumulatedGlossary.some(
        (existing) =>
          existing.original.toLowerCase() === term.original.toLowerCase(),
      ) ||
        initialGlossary.some(
          (existing) =>
            existing.original.toLowerCase() === term.original.toLowerCase(),
        );
      if (!isDuplicate) {
        accumulatedGlossary.push(term);
      }
    }
  }

  const processingTime = performance.now() - startTime;

  return {
    text: translatedText,
    title: translateOptions.title != null
      ? extractTitle(translatedText)
      : undefined,
    tokenUsed: totalTokensUsed,
    processingTime,
    qualityScore,
    refinementIterations,
    selectedModel: winningModel,
    accumulatedGlossary: accumulatedGlossary.length > 0
      ? accumulatedGlossary
      : undefined,
  };
}
