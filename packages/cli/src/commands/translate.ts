import { writeFileSync } from "node:fs";
import { commandLine, message, metavar, text } from "@optique/core/message";
import { print, printError } from "@optique/run";
import {
  fetchLinkedPages,
  fetchWebPage,
  type MediaType,
} from "@vertana/context-web";
import type { ContextSource } from "@vertana/core/context";
import { translate } from "@vertana/facade";
import type { TranslateResult } from "../cli.ts";
import { loadConfig } from "../config/index.ts";
import {
  type Glossary,
  loadGlossaryFile,
  mergeGlossaries,
} from "../glossary.ts";
import { readInput } from "../input.ts";
import { createModel } from "../model.ts";

/**
 * Executes the translate command.
 *
 * @param result The parsed translate command result.
 */
export async function executeTranslate(result: TranslateResult): Promise<void> {
  // Get the model from config
  const config = loadConfig();
  if (config.model == null) {
    printError(message`No model configured.`, { exitCode: 1 });
    print(
      message`Run ${commandLine("vertana config model")} ${
        metavar("PROVIDER:MODEL")
      } to set one.`,
    );
    return;
  }

  // Create the model
  const model = await createModel(config.model);

  // Read input text
  const inputText = await readInput(result.input);

  if (inputText.trim() === "") {
    printError(message`No input text provided.`, { exitCode: 1 });
    return;
  }

  // Build glossary from CLI options and file
  const glossary = buildGlossary(result.glossary, result.glossaryFile);

  // Build context sources
  const contextSources = buildContextSources(
    inputText,
    result.mediaType,
    result.fetchLinks,
  );

  // Perform translation
  const translation = await translate(model, result.target, inputText, {
    sourceLanguage: result.source,
    mediaType: result.mediaType,
    tone: result.tone,
    domain: result.domain,
    glossary: glossary.length > 0 ? glossary : undefined,
    contextSources: contextSources.length > 0 ? contextSources : undefined,
  });

  // Output the translation
  if (result.output != null) {
    try {
      writeFileSync(result.output, translation.text + "\n", "utf-8");
      print(message`Translation saved to: ${text(result.output)}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      printError(
        message`Failed to write to file: ${result.output} — ${
          text(errorMessage)
        }`,
        { exitCode: 1 },
      );
    }
  } else {
    // Raw text output to stdout (for piping)
    console.log(translation.text);
  }
}

/**
 * Builds a glossary from CLI options and an optional file.
 *
 * @param cliEntries Glossary entries from -g/--glossary options.
 * @param filePath Path to a glossary JSON file.
 * @returns The merged glossary.
 */
function buildGlossary(
  cliEntries: Glossary,
  filePath: string | undefined,
): Glossary {
  const glossaries: Glossary[] = [];

  // Load from file first (lower priority)
  if (filePath != null) {
    try {
      const fileGlossary = loadGlossaryFile(filePath);
      glossaries.push(fileGlossary);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      printError(
        message`Failed to load glossary file: ${filePath} — ${
          text(errorMessage)
        }`,
        { exitCode: 1 },
      );
      return [];
    }
  }

  // CLI entries have higher priority
  if (cliEntries.length > 0) {
    glossaries.push(cliEntries);
  }

  return mergeGlossaries(...glossaries);
}

/**
 * Builds context sources based on CLI options.
 *
 * @param text The input text.
 * @param mediaType The media type of the text.
 * @param fetchLinksEnabled Whether to fetch linked pages.
 * @returns Array of context sources.
 */
function buildContextSources(
  text: string,
  mediaType: MediaType,
  fetchLinksEnabled: boolean,
): ContextSource[] {
  const sources: ContextSource[] = [];

  if (fetchLinksEnabled) {
    // Fetch content from all linked pages in the text (required source)
    sources.push(fetchLinkedPages({ text, mediaType }));
    // Allow LLM to request additional URLs on demand (passive source)
    sources.push(fetchWebPage);
  }

  return sources;
}
