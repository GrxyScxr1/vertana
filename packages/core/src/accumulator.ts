import type { LanguageModel } from "ai";
import type {
  TranslateChunksComplete,
  TranslateChunksEvent,
} from "./translate.ts";

/**
 * Accumulated state from processing translation stream events.
 */
export interface AccumulatorState {
  /**
   * The completion event, if received.
   */
  readonly complete?: TranslateChunksComplete;

  /**
   * Sum of quality scores from chunk events.
   */
  readonly totalQualityScore: number;

  /**
   * Number of chunks that had quality scores.
   */
  readonly qualityScoreCount: number;

  /**
   * Count of wins per model during best-of-N selection.
   */
  readonly modelWinCounts: ReadonlyMap<LanguageModel, number>;
}

/**
 * Creates the initial accumulator state.
 *
 * @returns A fresh accumulator state with zeroed counters.
 */
export function createInitialAccumulatorState(): AccumulatorState {
  return {
    totalQualityScore: 0,
    qualityScoreCount: 0,
    modelWinCounts: new Map(),
  };
}

/**
 * Accumulates a translation stream event into the state.
 *
 * This is a pure function that returns a new state without modifying the input.
 *
 * @param state The current accumulator state.
 * @param event The event to accumulate.
 * @returns A new state with the event accumulated.
 */
export function accumulateEvent(
  state: AccumulatorState,
  event: TranslateChunksEvent,
): AccumulatorState {
  if (event.type === "complete") {
    return { ...state, complete: event };
  }

  let newState = state;

  if (event.qualityScore != null) {
    newState = {
      ...newState,
      totalQualityScore: newState.totalQualityScore + event.qualityScore,
      qualityScoreCount: newState.qualityScoreCount + 1,
    };
  }

  if (event.selectedModel != null) {
    const newCounts = new Map(newState.modelWinCounts);
    newCounts.set(
      event.selectedModel,
      (newCounts.get(event.selectedModel) ?? 0) + 1,
    );
    newState = { ...newState, modelWinCounts: newCounts };
  }

  return newState;
}

/**
 * Returns the key with the highest value in a map.
 *
 * @param map A map of keys to numeric values.
 * @returns The key with the highest value, or undefined if the map is empty.
 */
export function maxByValue<K>(map: ReadonlyMap<K, number>): K | undefined {
  let maxKey: K | undefined;
  let maxValue = -Infinity;
  for (const [key, value] of map) {
    if (value > maxValue) {
      maxValue = value;
      maxKey = key;
    }
  }
  return maxKey;
}
