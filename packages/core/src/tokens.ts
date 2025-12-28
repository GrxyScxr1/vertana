import { getEncoding, type Tiktoken } from "js-tiktoken";
import type { TokenCounter } from "./chunking.ts";

let encoder: Tiktoken | undefined;

/**
 * Gets the default tiktoken encoder (cl100k_base).
 *
 * @returns The tiktoken encoder instance.
 */
function getEncoder(): Tiktoken {
  if (encoder == null) {
    encoder = getEncoding("cl100k_base");
  }
  return encoder;
}

/**
 * Counts the number of tokens in a string using the cl100k_base encoding.
 *
 * This is the default token counter used by the chunker when no custom
 * counter is provided.
 *
 * @param text The text to count tokens for.
 * @returns The number of tokens.
 * @since 0.1.0
 */
export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

/**
 * Creates a token counter using the default tiktoken encoder (cl100k_base).
 *
 * @returns A token counter function.
 * @since 0.1.0
 */
export function createDefaultTokenCounter(): TokenCounter {
  return countTokens;
}
