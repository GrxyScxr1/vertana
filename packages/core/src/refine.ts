import { getLogger } from "@logtape/logtape";
import { generateText, type LanguageModel } from "ai";
import type { Glossary } from "./glossary.ts";
import {
  evaluate,
  type EvaluationResult,
  type TranslationIssue,
} from "./evaluation.ts";

const logger = getLogger(["vertana", "core", "refine"]);

/**
 * Options for the {@link refineChunks} function.
 */
export interface RefineChunksOptions {
  /**
   * The target language of the translation.
   */
  readonly targetLanguage: Intl.Locale | string;

  /**
   * The source language of the original text.
   */
  readonly sourceLanguage?: Intl.Locale | string;

  /**
   * The minimum acceptable quality score (0-1). Chunks with scores below
   * this threshold will be refined. Defaults to 0.85.
   */
  readonly targetScore?: number;

  /**
   * Maximum number of refinement iterations per chunk. Defaults to 3.
   */
  readonly maxIterations?: number;

  /**
   * A glossary of terms that should be used consistently.
   */
  readonly glossary?: Glossary;

  /**
   * Whether to evaluate boundaries between chunks for coherence.
   * Defaults to true.
   */
  readonly evaluateBoundaries?: boolean;

  /**
   * An optional `AbortSignal` to cancel the refinement.
   */
  readonly signal?: AbortSignal;
}

/**
 * The result of evaluating a boundary between two chunks.
 */
export interface BoundaryEvaluation {
  /**
   * Index of the first chunk in the boundary (chunk i and chunk i+1).
   */
  readonly chunkIndex: number;

  /**
   * A coherence score between 0 and 1.
   */
  readonly score: number;

  /**
   * Issues found at the boundary.
   */
  readonly issues: readonly BoundaryIssue[];
}

/**
 * An issue found at a chunk boundary.
 */
export interface BoundaryIssue {
  /**
   * The type of boundary issue.
   */
  readonly type: "coherence" | "style" | "reference" | "terminology";

  /**
   * A human-readable description of the issue.
   */
  readonly description: string;
}

/**
 * Record of a single refinement iteration for a chunk.
 */
export interface RefineIteration {
  /**
   * The chunk index that was refined.
   */
  readonly chunkIndex: number;

  /**
   * The iteration number (1-based).
   */
  readonly iteration: number;

  /**
   * The text before refinement.
   */
  readonly before: string;

  /**
   * The text after refinement.
   */
  readonly after: string;

  /**
   * The evaluation score before refinement.
   */
  readonly scoreBefore: number;

  /**
   * The evaluation score after refinement.
   */
  readonly scoreAfter: number;

  /**
   * Issues that were addressed in this iteration.
   */
  readonly issuesAddressed: readonly TranslationIssue[];
}

/**
 * The result of the {@link refineChunks} function.
 */
export interface RefineChunksResult {
  /**
   * The refined translated chunks.
   */
  readonly chunks: readonly string[];

  /**
   * Final evaluation scores for each chunk.
   */
  readonly scores: readonly number[];

  /**
   * Total number of refinement iterations performed.
   */
  readonly totalIterations: number;

  /**
   * History of all refinement iterations.
   */
  readonly history: readonly RefineIteration[];

  /**
   * Boundary evaluations (if evaluateBoundaries was enabled).
   */
  readonly boundaryEvaluations?: readonly BoundaryEvaluation[];
}

/**
 * Gets the language name from a locale.
 */
function getLanguageName(locale: Intl.Locale | string): string {
  const tag = typeof locale === "string" ? locale : locale.baseName;
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    return displayNames.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * Builds the system prompt for chunk refinement.
 */
function buildRefineSystemPrompt(
  options: RefineChunksOptions,
  issues: readonly TranslationIssue[],
): string {
  const targetLang = getLanguageName(options.targetLanguage);
  const sourceLang = options.sourceLanguage
    ? getLanguageName(options.sourceLanguage)
    : null;

  let prompt = `You are an expert translator refining a translation from ${
    sourceLang ?? "the source language"
  } to ${targetLang}.

You will be given:
1. The original text
2. The current translation
3. A list of issues found in the translation

Your task is to fix the issues while preserving the parts that are correct.
Output ONLY the improved translation, nothing else.

## Issues to fix

`;

  for (const issue of issues) {
    prompt += `- [${issue.type}] ${issue.description}\n`;
  }

  if (options.glossary != null && options.glossary.length > 0) {
    prompt += `\n## Glossary (must follow exactly)\n\n`;
    for (const entry of options.glossary) {
      prompt += `- "${entry.original}" → "${entry.translated}"\n`;
    }
  }

  return prompt;
}

/**
 * Builds the user prompt for chunk refinement.
 */
function buildRefineUserPrompt(original: string, translated: string): string {
  return `## Original Text

${original}

## Current Translation

${translated}

Please provide the improved translation:`;
}

/**
 * Refines a single chunk based on evaluation feedback.
 */
async function refineChunk(
  model: LanguageModel,
  original: string,
  translated: string,
  issues: readonly TranslationIssue[],
  options: RefineChunksOptions,
): Promise<string> {
  const systemPrompt = buildRefineSystemPrompt(options, issues);
  const userPrompt = buildRefineUserPrompt(original, translated);

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: options.signal,
  });

  return result.text.trim();
}

/**
 * Evaluates the boundary between two chunks for coherence.
 */
export async function evaluateBoundary(
  model: LanguageModel,
  chunk1Translated: string,
  chunk2Translated: string,
  chunk1Original: string,
  chunk2Original: string,
  options: RefineChunksOptions,
): Promise<Omit<BoundaryEvaluation, "chunkIndex">> {
  const targetLang = getLanguageName(options.targetLanguage);

  // Take last ~200 chars of chunk1 and first ~200 chars of chunk2
  const boundarySize = 200;
  const chunk1End = chunk1Translated.slice(-boundarySize);
  const chunk2Start = chunk2Translated.slice(0, boundarySize);
  const original1End = chunk1Original.slice(-boundarySize);
  const original2Start = chunk2Original.slice(0, boundarySize);

  const systemPrompt = `You are an expert translation quality evaluator.

Evaluate the coherence at the boundary between two consecutive translation chunks.

Check for:
1. **Coherence**: Does the text flow naturally from one chunk to the next?
2. **Style**: Is the style consistent across the boundary?
3. **Reference**: Are pronouns and references consistent?
4. **Terminology**: Are terms used consistently?

Respond in this exact JSON format:
{
  "score": <number between 0 and 1>,
  "issues": [
    {"type": "<coherence|style|reference|terminology>", "description": "<description>"}
  ]
}`;

  const userPrompt = `## End of chunk 1 (original)
${original1End}

## End of chunk 1 (translated to ${targetLang})
${chunk1End}

## Start of chunk 2 (original)
${original2Start}

## Start of chunk 2 (translated to ${targetLang})
${chunk2Start}

Evaluate the boundary coherence:`;

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: options.signal,
  });

  try {
    const parsed = JSON.parse(result.text) as {
      score: number;
      issues: readonly BoundaryIssue[];
    };
    return {
      score: Math.max(0, Math.min(1, parsed.score)),
      issues: parsed.issues ?? [],
    };
  } catch {
    // If parsing fails, assume it's okay
    return { score: 1, issues: [] };
  }
}

/**
 * Refines translated chunks to improve quality using an iterative
 * evaluate-fix loop.
 *
 * @param model The language model to use for refinement.
 * @param originalChunks The original text chunks that were translated.
 * @param translatedChunks The translated chunks to refine.
 * @param options Refinement options.
 * @returns A promise that resolves to the refinement result.
 * @throws {RangeError} If the number of original and translated chunks
 *                      do not match.
 */
export async function refineChunks(
  model: LanguageModel,
  originalChunks: readonly string[],
  translatedChunks: readonly string[],
  options: RefineChunksOptions,
): Promise<RefineChunksResult> {
  if (originalChunks.length !== translatedChunks.length) {
    throw new RangeError(
      `Chunk count mismatch: ${originalChunks.length} original vs ${translatedChunks.length} translated`,
    );
  }

  const targetScore = options.targetScore ?? 0.85;
  const maxIterations = options.maxIterations ?? 3;
  const shouldEvaluateBoundaries = options.evaluateBoundaries ?? true;

  logger.info("Starting refinement of {chunkCount} chunks...", {
    chunkCount: originalChunks.length,
    targetScore,
    maxIterations,
  });

  // Initialize working copies
  const refinedChunks = [...translatedChunks];
  const scores: number[] = new Array(translatedChunks.length).fill(0);
  const history: RefineIteration[] = [];
  let totalIterations = 0;

  // Evaluate and refine each chunk
  for (let i = 0; i < refinedChunks.length; i++) {
    options.signal?.throwIfAborted();

    logger.debug("Evaluating chunk {index} of {total}...", {
      index: i + 1,
      total: refinedChunks.length,
    });

    let currentText = refinedChunks[i];
    let evaluation: EvaluationResult;

    // Initial evaluation
    evaluation = await evaluate(model, originalChunks[i], currentText, {
      targetLanguage: options.targetLanguage,
      sourceLanguage: options.sourceLanguage,
      glossary: options.glossary,
      signal: options.signal,
    });

    scores[i] = evaluation.score;

    logger.debug("Chunk {index} initial score: {score}.", {
      index: i + 1,
      score: evaluation.score,
      issues: evaluation.issues.length,
    });

    // Refinement loop for this chunk
    let iteration = 0;
    while (evaluation.score < targetScore && iteration < maxIterations) {
      options.signal?.throwIfAborted();

      iteration++;
      totalIterations++;

      const beforeText = currentText;
      const scoreBefore = evaluation.score;
      const issuesAddressed = evaluation.issues;

      // Refine the chunk
      currentText = await refineChunk(
        model,
        originalChunks[i],
        currentText,
        evaluation.issues,
        options,
      );

      // Re-evaluate
      evaluation = await evaluate(model, originalChunks[i], currentText, {
        targetLanguage: options.targetLanguage,
        sourceLanguage: options.sourceLanguage,
        glossary: options.glossary,
        signal: options.signal,
      });

      history.push({
        chunkIndex: i,
        iteration,
        before: beforeText,
        after: currentText,
        scoreBefore,
        scoreAfter: evaluation.score,
        issuesAddressed,
      });

      logger.debug(
        "Chunk {chunkIndex} iteration {iteration}: {scoreBefore} → {scoreAfter}.",
        {
          chunkIndex: i + 1,
          iteration,
          scoreBefore,
          scoreAfter: evaluation.score,
        },
      );

      scores[i] = evaluation.score;
    }

    refinedChunks[i] = currentText;
  }

  // Evaluate boundaries if enabled and there are multiple chunks
  let boundaryEvaluations: BoundaryEvaluation[] | undefined;
  if (shouldEvaluateBoundaries && refinedChunks.length > 1) {
    logger.debug("Evaluating {count} chunk boundaries...", {
      count: refinedChunks.length - 1,
    });

    boundaryEvaluations = [];

    for (let i = 0; i < refinedChunks.length - 1; i++) {
      options.signal?.throwIfAborted();

      const boundaryResult = await evaluateBoundary(
        model,
        refinedChunks[i],
        refinedChunks[i + 1],
        originalChunks[i],
        originalChunks[i + 1],
        options,
      );

      boundaryEvaluations.push({
        chunkIndex: i,
        ...boundaryResult,
      });

      if (boundaryResult.issues.length > 0) {
        logger.warn(
          "Boundary {index} has {issueCount} issue(s), score: {score}.",
          {
            index: i + 1,
            issueCount: boundaryResult.issues.length,
            score: boundaryResult.score,
          },
        );
      }
    }
  }

  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  logger.info("Refinement completed.", {
    totalIterations,
    averageScore,
    chunkCount: refinedChunks.length,
  });

  return {
    chunks: refinedChunks,
    scores,
    totalIterations,
    history,
    boundaryEvaluations,
  };
}
