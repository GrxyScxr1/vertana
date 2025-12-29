import type { GlossaryEntry } from "./glossary.ts";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

/**
 * Options for extracting terms from a translation.
 */
export interface ExtractTermsOptions {
  /**
   * Maximum number of terms to extract.
   *
   * @default `10`
   */
  readonly maxTerms?: number;

  /**
   * Optional abort signal.
   */
  readonly signal?: AbortSignal;
}

/**
 * Schema for extracted terms.
 */
const extractedTermsSchema = z.object({
  terms: z.array(
    z.object({
      original: z.string().describe("The original term in the source text"),
      translated: z.string().describe("The translated term"),
      context: z
        .string()
        .optional()
        .describe("Optional context for when to use this translation"),
    }),
  ),
});

/**
 * Extracts key terminology pairs from source text and its translation.
 *
 * This function uses an LLM to identify important terms, proper nouns,
 * technical vocabulary, and other key phrases that should be translated
 * consistently throughout a document.
 *
 * @param model The language model to use for extraction.
 * @param sourceText The original source text.
 * @param translatedText The translated text.
 * @param options Optional extraction options.
 * @returns An array of glossary entries.
 */
export async function extractTerms(
  model: LanguageModel,
  sourceText: string,
  translatedText: string,
  options?: ExtractTermsOptions,
): Promise<readonly GlossaryEntry[]> {
  const maxTerms = options?.maxTerms ?? 10;
  const signal = options?.signal;

  signal?.throwIfAborted();

  const systemPrompt =
    `You are a terminology extraction expert. Your task is to identify key terms from a source text and its translation that should be translated consistently.

Focus on extracting:
- Technical terms and domain-specific vocabulary
- Proper nouns (names, organizations, products)
- Key concepts and phrases
- Terms that appear multiple times or are central to the meaning

Do NOT extract:
- Common words that don't need consistent translation
- Function words (articles, prepositions, conjunctions)
- Terms that are already well-known in both languages

Extract at most ${maxTerms} of the most important terms.`;

  const userPrompt = `Source text:
${sourceText}

Translated text:
${translatedText}

Extract the key terminology pairs from the above texts.`;

  const result = await generateObject({
    model,
    schema: extractedTermsSchema,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  });

  return result.object.terms.slice(0, maxTerms);
}
