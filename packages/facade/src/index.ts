import { getLogger } from "@logtape/logtape";
import {
  accumulateEvent,
  chunkText,
  combineContextResults,
  createInitialAccumulatorState,
  createToolSet,
  gatherRequiredContext,
  type Glossary,
  type PassiveContextSource,
  translateChunks,
} from "@vertana/core";
import type { LanguageModel, ToolSet } from "ai";
import { buildTranslation } from "./result.ts";
import type {
  BestOfNOptions,
  DynamicGlossaryOptions,
  RefinementOptions,
  TranslateOptions,
  Translation,
} from "./types.ts";

const logger = getLogger(["vertana", "facade", "translate"]);

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
 * @throws {Error} If the translation stream ends without a completion event.
 */
export async function translate(
  model: LanguageModel | readonly LanguageModel[],
  targetLanguage: Intl.Locale | string,
  text: string,
  options?: TranslateOptions,
): Promise<Translation> {
  const startTime = performance.now();

  logger.info("Starting translation...", {
    targetLanguage: targetLanguage.toString(),
    textLength: text.length,
  });

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
    logger.debug("Context gathering completed.", {
      contextLength: gatheredContext.length,
    });
  }

  const combinedContext = [options?.context, gatheredContext]
    .filter((c) => c != null && c.trim().length > 0)
    .join("\n\n");

  // 3. Chunk text (or use text as single chunk)
  const chunkingEnabled = options?.chunker !== null;
  if (chunkingEnabled) {
    options?.onProgress?.({ stage: "chunking", progress: 0 });
  }

  const maxTokens = options?.contextWindow?.type === "explicit"
    ? options.contextWindow.maxTokens
    : 4096;

  const sourceChunks = await chunkText(text, {
    chunker: options?.chunker,
    mediaType: options?.mediaType,
    maxTokens,
    signal: options?.signal,
  });

  if (chunkingEnabled) {
    options?.onProgress?.({ stage: "chunking", progress: 1 });
    logger.debug("Chunking completed.", { chunkCount: sourceChunks.length });
  }

  // 4. Prepare tools for passive sources
  const passiveSources = (options?.contextSources ?? []).filter(
    (s): s is PassiveContextSource<unknown> => s.mode === "passive",
  );

  let tools: ToolSet | undefined;
  if (passiveSources.length > 0) {
    options?.onProgress?.({ stage: "prompting", progress: 0 });
    tools = await createToolSet(passiveSources, options?.signal);
    options?.onProgress?.({ stage: "prompting", progress: 1 });
  }

  // Initial glossary from options
  const initialGlossary: Glossary = options?.glossary ?? [];
  const totalChunks = sourceChunks.length;

  // 5. Translate using translateChunks stream
  const modelsToUse = bestOfNOptions != null ? models : [primaryModel];

  options?.onProgress?.({
    stage: "translating",
    progress: 0,
    chunkIndex: 0,
    totalChunks,
  });

  // Normalize refinement options
  const refinementOptions: RefinementOptions | null =
    options?.refinement != null && options.refinement !== false
      ? options.refinement === true ? {} : options.refinement
      : null;

  // 5. Process translation stream
  let state = createInitialAccumulatorState();

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
      refinement: refinementOptions,
      tools,
      signal: options?.signal,
    })
  ) {
    state = accumulateEvent(state, event);

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

      // Report refining start after last chunk if refinement is enabled
      if (event.index === totalChunks - 1 && refinementOptions != null) {
        options?.onProgress?.({
          stage: "refining",
          progress: 0,
          maxIterations: refinementOptions.maxIterations ?? 3,
          totalChunks,
        });
      }
    }
  }

  // Report refining completion if refinement was used
  if (state.complete?.refinementIterations != null) {
    options?.onProgress?.({
      stage: "refining",
      progress: 1,
      iteration: state.complete.refinementIterations,
      maxIterations: refinementOptions?.maxIterations ?? 3,
      totalChunks,
    });
  }

  // 6. Build and return result
  const result = buildTranslation(state, {
    startTime,
    extractTitle: options?.title != null,
  });

  logger.info("Translation completed.", {
    processingTimeMs: result.processingTime,
    tokensUsed: result.tokenUsed,
    qualityScore: result.qualityScore,
    chunkCount: state.complete?.translations.length ?? 0,
  });

  return result;
}
