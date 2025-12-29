import type { Chunk, Chunker, ChunkerOptions } from "./chunking.ts";
import { countTokens as defaultCountTokens } from "./tokens.ts";

/**
 * Splits text by sentences when a paragraph exceeds the token limit.
 *
 * @param text The text to split.
 * @param maxTokens The maximum tokens per piece.
 * @param countTokens The token counter function.
 * @returns An array of text pieces.
 */
function splitBySentences(
  text: string,
  maxTokens: number,
  countTokens: (text: string) => number,
): readonly string[] {
  // Split by sentence boundaries (., !, ?) followed by space
  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let currentPart = "";

  for (const sentence of sentences) {
    const newPart = currentPart.length > 0
      ? `${currentPart} ${sentence}`
      : sentence;

    if (countTokens(newPart) > maxTokens && currentPart.length > 0) {
      parts.push(currentPart);
      currentPart = sentence;
    } else {
      currentPart = newPart;
    }
  }

  if (currentPart.length > 0) {
    parts.push(currentPart);
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Creates a plain text chunker.
 *
 * The chunker splits plain text content by paragraphs (separated by one or
 * more blank lines).  When a paragraph exceeds the token limit, it is further
 * split by sentences.
 *
 * @returns A chunker function for plain text content.
 * @since 0.2.0
 */
export function createPlainTextChunker(): Chunker {
  return async (
    text: string,
    options?: ChunkerOptions,
  ): Promise<readonly Chunk[]> => {
    const maxTokens = options?.maxTokens ?? 4096;
    const countTokens = options?.countTokens ?? defaultCountTokens;
    const signal = options?.signal;

    // Check for abort before starting
    signal?.throwIfAborted();

    // Ensure this is truly async
    await Promise.resolve();

    // Handle empty input
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return [];
    }

    // Split by paragraphs (one or more blank lines)
    const paragraphs = trimmed
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      signal?.throwIfAborted();

      const paragraphTokens = countTokens(paragraph);

      // If paragraph fits in one chunk, add it directly
      if (paragraphTokens <= maxTokens) {
        chunks.push({
          content: paragraph,
          type: "paragraph",
          index: chunkIndex++,
        });
        continue;
      }

      // Paragraph is too large, split by sentences
      const parts = splitBySentences(paragraph, maxTokens, countTokens);
      for (const part of parts) {
        chunks.push({
          content: part,
          type: "paragraph",
          index: chunkIndex++,
        });
      }
    }

    return chunks;
  };
}
