import type { Glossary } from "@vertana/core";
import type { MediaType, TranslationTone } from "./types.ts";

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * Gets the English display name for a language.
 *
 * @param language The language as an `Intl.Locale` or BCP 47 tag.
 * @returns The English display name for the language.
 */
export function getLanguageName(language: Intl.Locale | string): string {
  const tag = typeof language === "string" ? language : language.toString();
  return languageNames.of(tag) ?? tag;
}

/**
 * Options for building the system prompt.
 */
export interface SystemPromptOptions {
  readonly sourceLanguage?: Intl.Locale | string;
  readonly tone?: TranslationTone;
  readonly domain?: string;
  readonly mediaType?: MediaType;
  readonly context?: string;
  readonly glossary?: Glossary;
}

/**
 * Builds the system prompt for the translation.
 *
 * @param targetLanguage The target language for translation.
 * @param options Additional options for the prompt.
 * @returns The system prompt string.
 */
export function buildSystemPrompt(
  targetLanguage: Intl.Locale | string,
  options?: SystemPromptOptions,
): string {
  const targetLangName = getLanguageName(targetLanguage);

  const parts: string[] = [
    "You are a professional translator.",
    `Translate the given text into ${targetLangName}.`,
    "Preserve the original meaning, tone, and nuance as accurately as possible.",
    "Output only the translated text without any explanations or notes.",
  ];

  if (options?.sourceLanguage != null) {
    const sourceLangName = getLanguageName(options.sourceLanguage);
    parts.push(`The source language is ${sourceLangName}.`);
  }

  if (options?.tone != null) {
    parts.push(`Use a ${options.tone} tone in the translation.`);
  }

  if (options?.domain != null) {
    parts.push(
      `This text is from the ${options.domain} domain. ` +
        "Use appropriate terminology for this field.",
    );
  }

  if (options?.mediaType != null && options.mediaType !== "text/plain") {
    const formatName = options.mediaType === "text/html" ? "HTML" : "Markdown";
    parts.push(
      `The input is formatted as ${formatName}. ` +
        "Preserve the formatting structure in your translation.",
    );
  }

  if (options?.context != null) {
    parts.push(`Additional context: ${options.context}`);
  }

  if (options?.glossary != null && options.glossary.length > 0) {
    const glossaryLines = options.glossary.map((entry) => {
      const contextNote = entry.context != null ? ` (${entry.context})` : "";
      return `  - "${entry.original}" → "${entry.translated}"${contextNote}`;
    });
    parts.push(
      "Use the following glossary for consistent terminology:\n" +
        glossaryLines.join("\n"),
    );
  }

  return parts.join("\n\n");
}

/**
 * Builds the user prompt for the translation.
 *
 * @param text The text to translate.
 * @param title An optional title to include.
 * @returns The user prompt string.
 */
export function buildUserPrompt(text: string, title?: string): string {
  if (title != null) {
    return `Title: ${title}\n\n${text}`;
  }
  return text;
}

/**
 * Extracts the translated title from the translated text.
 *
 * @param translatedText The translated text that may contain a title.
 * @returns The extracted title, or undefined if not found.
 */
export function extractTitle(translatedText: string): string | undefined {
  // If the translation starts with "Title: ", extract it
  const match = translatedText.match(/^Title:\s*(.+?)(?:\n|$)/);
  if (match != null) {
    return match[1].trim();
  }
  // Otherwise, take the first line as the title
  const firstLine = translatedText.split("\n")[0];
  return firstLine?.trim() || undefined;
}
