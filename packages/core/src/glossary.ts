/**
 * A glossary of terms for consistent translation.
 */
export type Glossary = readonly GlossaryEntry[];

/**
 * An entry in a {@link Glossary}.
 */
export interface GlossaryEntry {
  /**
   * The original term in the source language.
   */
  readonly original: string;

  /**
   * The translated term in the target language.
   */
  readonly translated: string;

  /**
   * Optional context describing when to use this translation.
   * This helps disambiguate terms that may have multiple translations.
   */
  readonly context?: string;
}

/**
 * Options for the {@link keep} function.
 * @since 0.2.0
 */
export type KeepOptions = Omit<GlossaryEntry, "original" | "translated">;

/**
 * Creates a glossary entry that preserves the original term without translation.
 * Use this for brand names, technical terms, or any text that should remain as-is.
 *
 * @param term The term to preserve in its original form.
 * @param options Optional settings including context for disambiguation.
 * @returns A glossary entry with the same value for both original and translated.
 * @since 0.2.0
 *
 * @example
 * ```typescript
 * glossary: [
 *   keep("React"),
 *   keep("TypeScript", { context: "programming language" }),
 * ]
 * ```
 */
export function keep(term: string, options?: KeepOptions): GlossaryEntry {
  return {
    original: term,
    translated: term,
    ...options,
  };
}

/**
 * Alias for {@link keep}. Creates a glossary entry that preserves a proper noun
 * (brand name, product name, etc.) without translation.
 *
 * @param term The proper noun to preserve.
 * @param options Optional settings including context for disambiguation.
 * @returns A glossary entry with the same value for both original and translated.
 * @since 0.2.0
 *
 * @example
 * ```typescript
 * glossary: [
 *   properNoun("React"),
 *   properNoun("TypeScript"),
 * ]
 * ```
 */
export const properNoun = keep;
