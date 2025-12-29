import {
  generateText,
  type LanguageModel,
  stepCountIs,
  type ToolSet,
} from "ai";
import type { Glossary, GlossaryEntry } from "./glossary.ts";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildUserPromptWithContext,
  type MediaType,
  type TranslatedChunk,
  type TranslationTone,
} from "./prompt.ts";
import { refineChunks } from "./refine.ts";
import { type Candidate, selectBest } from "./select.ts";
import { extractTerms } from "./terms.ts";

/**
 * Options for dynamic glossary accumulation during chunk translation.
 */
export interface DynamicGlossaryOptions {
  /**
   * Maximum number of terms to extract from each chunk.
   *
   * @default `10`
   */
  readonly maxTermsPerChunk?: number;

  /**
   * The model to use for extracting terms.
   * If not specified, the primary translation model is used.
   */
  readonly extractorModel?: LanguageModel;
}

/**
 * Options for iterative refinement of translations.
 */
export interface RefinementOptions {
  /**
   * The minimum acceptable quality score (0-1). Chunks with scores below
   * this threshold will be refined.
   *
   * @default `0.85`
   */
  readonly qualityThreshold?: number;

  /**
   * Maximum number of refinement iterations per chunk.
   *
   * @default `3`
   */
  readonly maxIterations?: number;
}

/**
 * Options for translating chunks.
 */
export interface TranslateChunksOptions {
  /**
   * The target language for translation.
   */
  readonly targetLanguage: Intl.Locale | string;

  /**
   * The source language of the input text.
   */
  readonly sourceLanguage?: Intl.Locale | string;

  /**
   * An optional title for the input text. It's translated along with
   * the first chunk if provided.
   */
  readonly title?: string;

  /**
   * The desired tone for the translated text.
   */
  readonly tone?: TranslationTone;

  /**
   * The domain or context of the text.
   */
  readonly domain?: string;

  /**
   * The media type of the input text.
   */
  readonly mediaType?: MediaType;

  /**
   * Additional context for the translation.
   */
  readonly context?: string;

  /**
   * Initial glossary for consistent terminology.
   */
  readonly glossary?: Glossary;

  /**
   * The language models to use for translation.
   * If multiple models are provided, best-of-N selection is used.
   */
  readonly models: readonly LanguageModel[];

  /**
   * The model to use for evaluating and selecting the best translation.
   * If not specified, the first model in the array is used.
   */
  readonly evaluatorModel?: LanguageModel;

  /**
   * Dynamic glossary accumulation settings.
   * When enabled, terms are extracted from each translated chunk
   * and accumulated for use in subsequent chunks.
   */
  readonly dynamicGlossary?: DynamicGlossaryOptions | null;

  /**
   * Refinement settings for iterative translation improvement.
   * When enabled, chunks are evaluated and refined until they meet
   * the quality threshold or reach maximum iterations.
   */
  readonly refinement?: RefinementOptions | null;

  /**
   * Optional tools for passive context sources.
   */
  readonly tools?: ToolSet;

  /**
   * Optional abort signal.
   */
  readonly signal?: AbortSignal;
}

/**
 * Event yielded for each translated chunk.
 */
export interface TranslatedChunkEvent {
  readonly type: "chunk";

  /**
   * The index of the chunk (0-based).
   */
  readonly index: number;

  /**
   * The translated text for this chunk.
   */
  readonly translation: string;

  /**
   * The number of tokens used for this chunk.
   */
  readonly tokensUsed: number;

  /**
   * The quality score if best-of-N selection was used.
   */
  readonly qualityScore?: number;

  /**
   * The model that produced the best translation for this chunk.
   */
  readonly selectedModel?: LanguageModel;

  /**
   * Terms extracted from this chunk if dynamic glossary is enabled.
   */
  readonly extractedTerms?: readonly GlossaryEntry[];
}

/**
 * Event yielded when all chunks are translated.
 */
export interface TranslateChunksComplete {
  readonly type: "complete";

  /**
   * All translated chunks in order.
   */
  readonly translations: readonly string[];

  /**
   * Total tokens used across all chunks.
   */
  readonly totalTokensUsed: number;

  /**
   * All accumulated glossary terms from dynamic extraction.
   */
  readonly accumulatedGlossary: readonly GlossaryEntry[];

  /**
   * Average quality score across all chunks.
   * Only present if best-of-N selection or refinement was used.
   */
  readonly qualityScore?: number;

  /**
   * Total number of refinement iterations performed.
   * Only present if refinement was enabled.
   */
  readonly refinementIterations?: number;
}

/**
 * Events yielded during chunk translation.
 */
export type TranslateChunksEvent =
  | TranslatedChunkEvent
  | TranslateChunksComplete;

/**
 * Translates a single chunk of text.
 */
async function translateSingleChunk(
  model: LanguageModel,
  systemPrompt: string,
  text: string,
  previousChunks: readonly TranslatedChunk[],
  tools?: ToolSet,
  hasPassiveSources?: boolean,
  signal?: AbortSignal,
  title?: string,
): Promise<{ text: string; tokenUsed: number }> {
  const userPrompt = previousChunks.length > 0
    ? buildUserPromptWithContext(text, previousChunks)
    : buildUserPrompt(text, title);
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
 * Translates source chunks using the provided models and options.
 *
 * This function returns an async iterable that yields events for each
 * translated chunk, allowing consumers to process chunks incrementally
 * and track progress.
 *
 * Features:
 * - Per-chunk parallel translation with multiple models (best-of-N selection)
 * - Previous chunk context passing for consistency
 * - Dynamic glossary accumulation across chunks
 * - Streaming results via AsyncIterable
 *
 * @param sourceChunks The source text chunks to translate.
 * @param options Translation options.
 * @returns An async iterable of translation events.
 */
export async function* translateChunks(
  sourceChunks: readonly string[],
  options: TranslateChunksOptions,
): AsyncIterable<TranslateChunksEvent> {
  const {
    targetLanguage,
    sourceLanguage,
    title,
    tone,
    domain,
    mediaType,
    context,
    glossary: initialGlossary = [],
    models,
    evaluatorModel,
    dynamicGlossary,
    refinement,
    tools,
    signal,
  } = options;

  const primaryModel = models[0];
  const useBestOfN = models.length > 1;
  const hasPassiveSources = tools != null && Object.keys(tools).length > 0;

  // Base options for system prompt (without glossary, which may be accumulated)
  const baseSystemPromptOptions = {
    sourceLanguage,
    tone,
    domain,
    mediaType,
    context,
  };

  // Accumulated glossary for dynamic term extraction
  const accumulatedGlossary: GlossaryEntry[] = [];

  /**
   * Builds system prompt with the current glossary state.
   */
  function buildCurrentSystemPrompt(): string {
    const currentGlossary: Glossary = accumulatedGlossary.length > 0
      ? [...initialGlossary, ...accumulatedGlossary]
      : initialGlossary;
    return buildSystemPrompt(targetLanguage, {
      ...baseSystemPromptOptions,
      glossary: currentGlossary.length > 0 ? currentGlossary : undefined,
    });
  }

  const translations: string[] = [];
  let totalTokensUsed = 0;
  const previousChunks: TranslatedChunk[] = [];

  for (let i = 0; i < sourceChunks.length; i++) {
    signal?.throwIfAborted();

    // Build system prompt with current glossary state
    const currentSystemPrompt = dynamicGlossary != null
      ? buildCurrentSystemPrompt()
      : buildSystemPrompt(targetLanguage, {
        ...baseSystemPromptOptions,
        glossary: initialGlossary.length > 0 ? initialGlossary : undefined,
      });

    // Current glossary for evaluation
    const currentGlossary: Glossary = accumulatedGlossary.length > 0
      ? [...initialGlossary, ...accumulatedGlossary]
      : initialGlossary;

    // Translate current chunk with all models in parallel
    // Title is only included for the first chunk
    const chunkTitle = i === 0 ? title : undefined;
    const chunkResults = await Promise.all(
      models.map(async (model) => {
        const result = await translateSingleChunk(
          model,
          currentSystemPrompt,
          sourceChunks[i],
          previousChunks,
          tools,
          hasPassiveSources,
          signal,
          chunkTitle,
        );
        return { model, ...result };
      }),
    );

    // Sum up tokens used
    let chunkTokensUsed = 0;
    for (const result of chunkResults) {
      chunkTokensUsed += result.tokenUsed;
    }
    totalTokensUsed += chunkTokensUsed;

    // Select best translation for this chunk
    let selectedTranslation: string;
    let selectedModel: LanguageModel | undefined;
    let qualityScore: number | undefined;

    if (useBestOfN) {
      const candidates: Array<Candidate<LanguageModel>> = chunkResults.map(
        (r) => ({ text: r.text, metadata: r.model }),
      );

      const selectionResult = await selectBest(
        evaluatorModel ?? primaryModel,
        sourceChunks[i],
        candidates,
        {
          targetLanguage,
          sourceLanguage,
          glossary: currentGlossary.length > 0 ? currentGlossary : undefined,
          signal,
        },
      );

      selectedTranslation = selectionResult.best.text;
      selectedModel = selectionResult.best.metadata;
      qualityScore = selectionResult.best.score;
    } else {
      selectedTranslation = chunkResults[0].text;
    }

    translations.push(selectedTranslation);

    // Extract and accumulate terms if dynamic glossary is enabled
    let extractedTerms: readonly GlossaryEntry[] | undefined;
    if (dynamicGlossary != null) {
      const extractorModel = dynamicGlossary.extractorModel ?? primaryModel;
      const maxTermsPerChunk = dynamicGlossary.maxTermsPerChunk ?? 10;

      extractedTerms = await extractTerms(
        extractorModel,
        sourceChunks[i],
        selectedTranslation,
        {
          maxTerms: maxTermsPerChunk,
          signal,
        },
      );

      // Add extracted terms to accumulated glossary (avoiding duplicates)
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

    // Add to previous chunks for context in next iteration
    previousChunks.push({
      source: sourceChunks[i],
      translation: selectedTranslation,
    });

    // Yield chunk event
    yield {
      type: "chunk",
      index: i,
      translation: selectedTranslation,
      tokensUsed: chunkTokensUsed,
      qualityScore,
      selectedModel,
      extractedTerms,
    };
  }

  // Apply refinement if enabled
  let finalTranslations = translations;
  let finalQualityScore: number | undefined;
  let refinementIterations: number | undefined;

  if (refinement != null) {
    const refinementGlossary: Glossary = accumulatedGlossary.length > 0
      ? [...initialGlossary, ...accumulatedGlossary]
      : initialGlossary;

    const refineResult = await refineChunks(
      primaryModel,
      sourceChunks,
      translations,
      {
        targetLanguage,
        sourceLanguage,
        targetScore: refinement.qualityThreshold ?? 0.85,
        maxIterations: refinement.maxIterations ?? 3,
        glossary: refinementGlossary.length > 0
          ? refinementGlossary
          : undefined,
        evaluateBoundaries: sourceChunks.length > 1,
        signal,
      },
    );

    finalTranslations = [...refineResult.chunks];
    finalQualityScore = refineResult.scores.reduce((a, b) => a + b, 0) /
      refineResult.scores.length;
    refinementIterations = refineResult.totalIterations;
  }

  // Yield completion event
  yield {
    type: "complete",
    translations: finalTranslations,
    totalTokensUsed,
    accumulatedGlossary,
    qualityScore: finalQualityScore,
    refinementIterations,
  };
}
