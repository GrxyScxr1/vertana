import type {
  Chunker,
  ContextSource,
  ContextWindow,
  Glossary,
  MediaType,
  TranslationTone,
} from "@vertana/core";
import type { LanguageModel } from "ai";

export type { MediaType, TranslationTone } from "@vertana/core";

/**
 * Base progress information shared by all stages.
 */
interface BaseProgress {
  /**
   * The progress percentage (0 to 1) of the current stage.
   */
  readonly progress: number;
}

/**
 * Progress information for the chunking stage.
 */
export interface ChunkingProgress extends BaseProgress {
  readonly stage: "chunking";
}

/**
 * Progress information for the prompting stage.
 */
export interface PromptingProgress extends BaseProgress {
  readonly stage: "prompting";
}

/**
 * Progress information for the context gathering stage.
 */
export interface GatheringContextProgress extends BaseProgress {
  readonly stage: "gatheringContext";
}

/**
 * Progress information for the translating stage.
 */
export interface TranslatingProgress extends BaseProgress {
  readonly stage: "translating";

  /**
   * When chunking is used, indicates the current chunk index (0-based).
   */
  readonly chunkIndex?: number;

  /**
   * When chunking is used, indicates total number of chunks.
   */
  readonly totalChunks?: number;
}

/**
 * Progress information for the refining stage.
 */
export interface RefiningProgress extends BaseProgress {
  readonly stage: "refining";

  /**
   * The current refinement iteration (1-based).
   */
  readonly iteration?: number;

  /**
   * The maximum number of refinement iterations.
   */
  readonly maxIterations?: number;

  /**
   * When refining chunks, indicates the current chunk index (0-based).
   */
  readonly chunkIndex?: number;

  /**
   * When refining chunks, indicates total number of chunks.
   */
  readonly totalChunks?: number;
}

/**
 * Progress information for the best-of-N selection stage.
 */
export interface SelectingProgress extends BaseProgress {
  readonly stage: "selecting";

  /**
   * The current candidate being evaluated (0-based).
   */
  readonly candidateIndex?: number;

  /**
   * The total number of candidates.
   */
  readonly totalCandidates?: number;
}

/**
 * Progress information for the translation process.
 */
export type TranslationProgress =
  | ChunkingProgress
  | PromptingProgress
  | GatheringContextProgress
  | TranslatingProgress
  | RefiningProgress
  | SelectingProgress;

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

  /**
   * The final quality score after refinement (0-1).
   * Only present when refinement is enabled.
   */
  readonly qualityScore?: number;

  /**
   * The number of refinement iterations performed.
   * Only present when refinement is enabled.
   */
  readonly refinementIterations?: number;

  /**
   * The model that produced the best translation.
   * Only present when best-of-N selection is used with multiple models.
   */
  readonly selectedModel?: LanguageModel;

  /**
   * The accumulated glossary from dynamic term extraction.
   * Only present when dynamic glossary is enabled.
   */
  readonly accumulatedGlossary?: Glossary;
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
 * Options for best-of-N selection when multiple models are provided.
 */
export interface BestOfNOptions {
  /**
   * The model to use for evaluating and selecting the best translation.
   * If not specified, the first model in the array is used.
   */
  readonly evaluatorModel?: LanguageModel;
}

/**
 * Options for dynamic glossary accumulation during translation.
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

  /**
   * A custom chunker function for splitting long texts.  If not provided,
   * a default chunker is selected based on `mediaType`:
   *
   * - `"text/markdown"`: Markdown-aware chunker
   * - `"text/plain"` or `"text/html"`: Paragraph-based chunker
   *
   * Set to `null` to disable chunking entirely.
   */
  readonly chunker?: Chunker | null;

  /**
   * Best-of-N selection settings.  When multiple models are provided and this
   * is enabled, each model generates a translation and the best one is selected
   * based on evaluation scores.
   *
   * - `true`: Enable best-of-N selection with default settings.
   * - `BestOfNOptions`: Enable with custom settings.
   * - `undefined` or `false`: Disabled (only first model is used).
   */
  readonly bestOfN?: boolean | BestOfNOptions;

  /**
   * Dynamic glossary accumulation settings.  When enabled, key terminology
   * pairs are extracted from each translated chunk and accumulated for use
   * in subsequent chunks, improving terminology consistency.
   *
   * - `true`: Enable dynamic glossary with default settings.
   * - `DynamicGlossaryOptions`: Enable with custom settings.
   * - `undefined` or `false`: Disabled.
   */
  readonly dynamicGlossary?: boolean | DynamicGlossaryOptions;
}
