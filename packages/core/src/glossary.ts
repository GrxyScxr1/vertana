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
