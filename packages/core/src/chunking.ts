import type { MediaType } from "./prompt.ts";

// Re-export MediaType from prompt.ts for convenience
export type { MediaType };

/**
 * A function that counts the number of tokens in a string.
 *
 * @param text The text to count tokens for.
 * @returns The number of tokens.
 */
export type TokenCounter = (text: string) => number;

/**
 * Options for {@link Chunker}.
 */
export interface ChunkerOptions {
  /**
   * The maximum number of tokens per chunk.
   *
   * @default `4096`
   */
  readonly maxTokens?: number;

  /**
   * A custom token counter function.  If not provided, a default
   * implementation using js-tiktoken (cl100k_base encoding) is used.
   */
  readonly countTokens?: TokenCounter;

  /**
   * An optional `AbortSignal` to cancel the chunking operation.
   */
  readonly signal?: AbortSignal;
}

/**
 * Splits text into chunks for translation.
 *
 * @param text The text to split into chunks.
 * @param options Optional settings for the chunking operation.
 * @returns A promise that resolves to an array of chunks.
 */
export type Chunker = (
  text: string,
  options?: ChunkerOptions,
) => Promise<readonly Chunk[]>;

/**
 * The type of content in a chunk.
 *
 * - `"paragraph"`: A paragraph of text.
 * - `"section"`: A section of the document.
 * - `"heading"`: A heading or title.
 * - `"list"`: A list of items.
 * - `"code"`: A code block.
 */
export type ChunkType =
  | "paragraph"
  | "section"
  | "heading"
  | "list"
  | "code";

/**
 * A chunk of text to be translated.
 */
export interface Chunk {
  /**
   * The text content of the chunk.
   */
  readonly content: string;

  /**
   * The type of content in the chunk.
   */
  readonly type: ChunkType;

  /**
   * The zero-based index of the chunk in the document.
   */
  readonly index: number;
}

/**
 * Options for {@link chunkText}.
 */
export interface ChunkTextOptions {
  /**
   * The media type of the text.  Used to select the default chunker
   * when {@link chunker} is not provided.
   *
   * - `"text/html"`: Uses the HTML chunker.
   * - `"text/markdown"` or `"text/plain"`: Uses the Markdown chunker.
   *
   * @default `"text/markdown"`
   */
  readonly mediaType?: MediaType;

  /**
   * A custom chunker function.  If not provided, a default chunker
   * based on {@link mediaType} is used.  Set to `null` to disable
   * chunking entirely (text will be returned as a single chunk).
   */
  readonly chunker?: Chunker | null;

  /**
   * The maximum number of tokens per chunk.
   *
   * @default `4096`
   */
  readonly maxTokens?: number;

  /**
   * A custom token counter function.  If not provided, a default
   * implementation using js-tiktoken (cl100k_base encoding) is used.
   */
  readonly countTokens?: TokenCounter;

  /**
   * An optional `AbortSignal` to cancel the chunking operation.
   */
  readonly signal?: AbortSignal;
}

/**
 * Gets the default chunker based on media type.
 *
 * @param mediaType The media type of the text.
 * @returns A promise that resolves to the appropriate chunker for the media type.
 */
export async function getDefaultChunker(
  mediaType?: MediaType,
): Promise<Chunker> {
  // Lazy imports to avoid circular dependencies
  if (mediaType === "text/html") {
    const { createHtmlChunker } = await import("./html.ts");
    return createHtmlChunker();
  }
  const { createMarkdownChunker } = await import("./markdown.ts");
  return createMarkdownChunker();
}

/**
 * Chunks text into smaller pieces for translation.
 *
 * This is a convenience function that combines chunker selection and execution.
 * If chunking is disabled (chunker is `null`), the text is returned as a
 * single-element array.
 *
 * @param text The text to chunk.
 * @param options Options for chunking.
 * @returns A promise that resolves to an array of chunk content strings.
 */
export async function chunkText(
  text: string,
  options?: ChunkTextOptions,
): Promise<readonly string[]> {
  const signal = options?.signal;
  signal?.throwIfAborted();

  // If chunker is explicitly null, return text as single chunk
  if (options?.chunker === null) {
    return [text];
  }

  // Get chunker: use provided or get default based on mediaType
  const chunker = options?.chunker ??
    await getDefaultChunker(options?.mediaType);

  // Default token counter
  let countTokens = options?.countTokens;
  if (countTokens == null) {
    const { countTokens: defaultCounter } = await import("./tokens.ts");
    countTokens = defaultCounter;
  }

  // Run chunker
  const chunks = await chunker(text, {
    maxTokens: options?.maxTokens ?? 4096,
    countTokens,
    signal,
  });

  // If no chunks produced, return text as single chunk
  if (chunks.length === 0) {
    return [text];
  }

  // Extract content from chunks
  return chunks.map((c) => c.content);
}
