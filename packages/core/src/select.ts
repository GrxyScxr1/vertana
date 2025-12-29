import { getLogger } from "@logtape/logtape";
import type { LanguageModel } from "ai";
import type { Glossary } from "./glossary.ts";
import { evaluate, type TranslationIssue } from "./evaluation.ts";

const logger = getLogger(["vertana", "core", "select"]);

/**
 * A translation candidate to be evaluated.
 */
export interface Candidate<T = unknown> {
  /**
   * The translated text.
   */
  readonly text: string;

  /**
   * Optional metadata associated with this candidate (e.g., model info).
   */
  readonly metadata?: T;
}

/**
 * A candidate with evaluation results and ranking.
 */
export interface RankedCandidate<T = unknown> extends Candidate<T> {
  /**
   * The evaluation score (0-1).
   */
  readonly score: number;

  /**
   * Issues found in the translation.
   */
  readonly issues: readonly TranslationIssue[];

  /**
   * The rank of this candidate (1-based, 1 is best).
   */
  readonly rank: number;
}

/**
 * Options for the {@link selectBest} function.
 */
export interface SelectBestOptions {
  /**
   * The target language of the translation.
   */
  readonly targetLanguage: Intl.Locale | string;

  /**
   * The source language of the original text.
   */
  readonly sourceLanguage?: Intl.Locale | string;

  /**
   * A glossary of terms that should be used consistently.
   */
  readonly glossary?: Glossary;

  /**
   * An optional `AbortSignal` to cancel the selection.
   */
  readonly signal?: AbortSignal;
}

/**
 * The result of the {@link selectBest} function.
 */
export interface SelectBestResult<T = unknown> {
  /**
   * The best candidate based on evaluation scores.
   */
  readonly best: RankedCandidate<T>;

  /**
   * All candidates with their evaluation results, sorted by rank.
   */
  readonly all: readonly RankedCandidate<T>[];
}

/**
 * Evaluates multiple translation candidates and selects the best one.
 *
 * @param evaluatorModel The language model to use for evaluation.
 * @param original The original text that was translated.
 * @param candidates The translation candidates to evaluate.
 * @param options Selection options.
 * @returns A promise that resolves to the selection result.
 * @throws {RangeError} If no candidates are provided.
 */
export async function selectBest<T = unknown>(
  evaluatorModel: LanguageModel,
  original: string,
  candidates: readonly Candidate<T>[],
  options: SelectBestOptions,
): Promise<SelectBestResult<T>> {
  if (candidates.length === 0) {
    throw new RangeError("At least one candidate is required.");
  }

  logger.debug("Selecting best from {count} candidates...", {
    count: candidates.length,
  });

  // Evaluate all candidates
  const evaluatedCandidates: Array<{
    candidate: Candidate<T>;
    score: number;
    issues: readonly TranslationIssue[];
  }> = [];

  for (const candidate of candidates) {
    options.signal?.throwIfAborted();

    const evaluation = await evaluate(
      evaluatorModel,
      original,
      candidate.text,
      {
        targetLanguage: options.targetLanguage,
        sourceLanguage: options.sourceLanguage,
        glossary: options.glossary,
        signal: options.signal,
      },
    );

    evaluatedCandidates.push({
      candidate,
      score: evaluation.score,
      issues: evaluation.issues,
    });

    logger.debug("Candidate {index} score: {score}.", {
      index: evaluatedCandidates.length,
      score: evaluation.score,
      issues: evaluation.issues.length,
    });
  }

  // Sort by score (descending) and assign ranks
  const sorted = [...evaluatedCandidates].sort((a, b) => b.score - a.score);

  const rankedCandidates: RankedCandidate<T>[] = sorted.map((item, index) => ({
    text: item.candidate.text,
    metadata: item.candidate.metadata,
    score: item.score,
    issues: item.issues,
    rank: index + 1,
  }));

  logger.debug("Selected best candidate with score: {score}.", {
    score: rankedCandidates[0].score,
    totalCandidates: candidates.length,
  });

  return {
    best: rankedCandidates[0],
    all: rankedCandidates,
  };
}
