import type { ContextSource, ContextWindow, Glossary } from "@vertana/core";

/**
 * The media type of the input text.
 *
 * - `"text/plain"`: Plain text
 * - `"text/html"`: HTML content
 * - `"text/markdown"`: Markdown content
 */
export type MediaType = "text/plain" | "text/html" | "text/markdown";

/**
 * The desired tone for the translated text.
 */
export type TranslationTone =
  | "formal"
  | "informal"
  | "technical"
  | "casual"
  | "professional"
  | "literary";

/**
 * Progress information for the translation process.
 */
export interface TranslationProgress {
  /**
   * The current stage of the translation process.
   */
  readonly stage: "prompting" | "gatheringContext" | "translating";

  /**
   * The progress percentage (0 to 1) of the current stage.
   */
  readonly progress: number;
}

/**
 * The result of a translation operation.
 */
export interface Translation {
  /**
   * The translated text.
   */
  readonly text: string;

  /**
   * An optional title for the translated text, if provided.
   */
  readonly title?: string;

  /**
   * The total number of tokens used during the translation process.
   */
  readonly tokenUsed: number;

  /**
   * The time taken to process the translation, in milliseconds.
   */
  readonly processingTime: number;
}

/**
 * Options for iterative translation refinement.
 */
export interface RefinementOptions {
  /**
   * Maximum number of refinement iterations.
   *
   * @default `3`
   */
  readonly maxIterations?: number;

  /**
   * Quality threshold (0-1).  If the evaluation score exceeds this threshold,
   * refinement stops early.
   *
   * @default `0.9`
   */
  readonly qualityThreshold?: number;
}

/**
 * Options for the translate function.
 */
export interface TranslateOptions {
  /**
   * The source language of the input text.  If not provided, the language will
   * be auto-detected.
   *
   * If a string is provided, it should be a valid BCP 47 language tag.
   */
  readonly sourceLanguage?: Intl.Locale | string;

  /**
   * An optional title for the input text.  It's also translated if provided.
   */
  readonly title?: string;

  /**
   * Additional context or background information about the input text.  This
   * can help improve translation accuracy.
   */
  readonly context?: string;

  /**
   * The desired tone for the translated text.  This helps tailor the style
   * and formality of the output.
   */
  readonly tone?: TranslationTone;

  /**
   * The domain or context of the input text, e.g., `"medical"`, `"legal"`,
   * `"technical"`, etc.  This helps the model produce more accurate
   * translations by tailoring the output to the specific field.
   */
  readonly domain?: string;

  /**
   * The media type of the input text.  This hints at the formatting and
   * structure of the content so that the model can maintain it in
   * the translation.
   *
   * @default `"text/plain"`
   */
  readonly mediaType?: MediaType;

  /**
   * An optional callback function that is invoked to report progress
   * during the translation process.
   *
   * @param progress The current progress information.
   */
  readonly onProgress?: (progress: TranslationProgress) => void;

  /**
   * An optional `AbortSignal` to cancel the translation request.
   */
  readonly signal?: AbortSignal;

  /**
   * Context sources to gather additional information for translation.
   * These can be either required (always invoked) or passive (invoked by
   * the LLM agent on demand).
   */
  readonly contextSources?: readonly ContextSource[];

  /**
   * A glossary of terms for consistent translation.  Terms in the glossary
   * will be translated consistently throughout the document.
   */
  readonly glossary?: Glossary;

  /**
   * Context window management strategy.  This controls how the translation
   * handles long documents that may exceed the model's context window.
   *
   * @default `{ type: "explicit", maxTokens: 8192 }`
   */
  readonly contextWindow?: ContextWindow;

  /**
   * Refinement settings for iterative translation improvement.  When enabled,
   * the translation will be evaluated and refined until the quality threshold
   * is met or the maximum number of iterations is reached.
   */
  readonly refinement?: RefinementOptions;
}
