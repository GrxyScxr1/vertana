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
