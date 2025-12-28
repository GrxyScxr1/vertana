/**
 * Options for {@link TranslationEvaluator}.
 */
export interface EvaluatorOptions {
  /**
   * An optional `AbortSignal` to cancel the evaluation.
   */
  readonly signal?: AbortSignal;
}

/**
 * Evaluates the quality of a translation.
 *
 * @param original The original text that was translated.
 * @param translated The translated text to evaluate.
 * @param options Optional settings for the evaluation.
 * @returns A promise that resolves to the evaluation result.
 */
export type TranslationEvaluator = (
  original: string,
  translated: string,
  options?: EvaluatorOptions,
) => Promise<EvaluationResult>;

/**
 * The result of evaluating a translation.
 */
export interface EvaluationResult {
  /**
   * A quality score between 0 and 1, where 1 indicates a perfect translation
   * and 0 indicates a completely incorrect translation.
   */
  readonly score: number;

  /**
   * Specific issues found in the translation.
   */
  readonly issues: readonly TranslationIssue[];
}

/**
 * The type of issue found in a translation.
 *
 * - `"accuracy"`: The translation does not accurately convey the meaning
 *   of the original text.
 * - `"fluency"`: The translation is not natural or readable in the target
 *   language.
 * - `"terminology"`: Incorrect or inconsistent use of domain-specific terms.
 * - `"style"`: The translation does not match the desired tone or style.
 */
export type TranslationIssueType =
  | "accuracy"
  | "fluency"
  | "terminology"
  | "style";

/**
 * A specific issue found in a translation.
 */
export interface TranslationIssue {
  /**
   * The type of issue.
   */
  readonly type: TranslationIssueType;

  /**
   * A human-readable description of the issue.
   */
  readonly description: string;

  /**
   * The location of the issue in the translated text, if applicable.
   */
  readonly location?: TranslationIssueLocation;
}

/**
 * The location of a translation issue within the translated text.
 */
export interface TranslationIssueLocation {
  /**
   * The starting character index (0-based, inclusive).
   */
  readonly start: number;

  /**
   * The ending character index (0-based, exclusive).
   */
  readonly end: number;
}
