import { type AccumulatorState, extractTitle, maxByValue } from "@vertana/core";
import type { Translation } from "./types.ts";

/**
 * Options for building the translation result.
 */
export interface BuildTranslationOptions {
  /**
   * The start time of the translation (from `performance.now()`).
   */
  readonly startTime: number;

  /**
   * Whether to extract a title from the translated text.
   */
  readonly extractTitle?: boolean;
}

/**
 * Builds the final translation result from accumulated stream state.
 *
 * @param state The accumulated state from processing the translation stream.
 * @param options Options for building the result.
 * @returns The translation result.
 * @throws {Error} If the translation stream did not complete.
 */
export function buildTranslation(
  state: AccumulatorState,
  options: BuildTranslationOptions,
): Translation {
  const { complete, totalQualityScore, qualityScoreCount, modelWinCounts } =
    state;

  if (complete == null) {
    throw new Error("Translation did not complete.");
  }

  const text = complete.translations.join("\n\n");
  const processingTime = performance.now() - options.startTime;

  const qualityScore = complete.qualityScore ??
    (qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : undefined);

  const selectedModel = maxByValue(modelWinCounts);

  return {
    text,
    title: options.extractTitle ? extractTitle(text) : undefined,
    tokenUsed: complete.totalTokensUsed,
    processingTime,
    qualityScore,
    refinementIterations: complete.refinementIterations,
    selectedModel,
    accumulatedGlossary: complete.accumulatedGlossary.length > 0
      ? complete.accumulatedGlossary
      : undefined,
  };
}
