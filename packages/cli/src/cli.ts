import { merge, object, or } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import { multiple, optional, withDefault } from "@optique/core/modifiers";
import type { InferValue } from "@optique/core/parser";
import { argument, command, constant, option } from "@optique/core/primitives";
import { choice, string } from "@optique/core/valueparser";
import { loggingOptions } from "@optique/logtape";
import { path } from "@optique/run/valueparser";
import { glossaryEntry } from "./glossary.ts";
import { modelCode } from "./model.ts";

/**
 * Global options shared across all subcommands.
 */
const globalOptions = object({
  logging: loggingOptions({ level: "verbosity" }),
});

/**
 * Parser for the "translate" subcommand.
 */
export const translateCommand = command(
  "translate",
  object({
    command: constant("translate" as const),
    target: option("-t", "--target", string({ metavar: "LANG" }), {
      description:
        message`Target language code (e.g., ${"ko"}, ${"ja"}, ${"es"}).`,
    }),
    source: optional(
      option("-s", "--source", string({ metavar: "LANG" }), {
        description: message`Source language code. Auto-detected if omitted.`,
      }),
    ),
    mediaType: withDefault(
      option(
        "-T",
        "--type",
        choice(["text/plain", "text/markdown", "text/html"] as const),
        {
          description: message`Media type of the input text.`,
        },
      ),
      "text/plain" as const,
    ),
    tone: optional(
      option(
        "--tone",
        choice(
          [
            "formal",
            "informal",
            "technical",
            "casual",
            "professional",
            "literary",
            "journalistic",
          ] as const,
        ),
        {
          description: message`Tone of the translation.`,
        },
      ),
    ),
    domain: optional(
      option("--domain", string(), {
        description:
          message`Domain or context (e.g., ${"legal"}, ${"medical"}, ${"tech"}).`,
      }),
    ),
    glossary: multiple(
      option("-g", "--glossary", glossaryEntry(), {
        description: message`Term translation mapping. Can be repeated.`,
      }),
    ),
    glossaryFile: optional(
      option("--glossary-file", path({ mustExist: true, type: "file" }), {
        description: message`Path to a JSON file with glossary entries.`,
      }),
    ),
    fetchLinks: option("-L", "--fetch-links", {
      description: message`Fetch linked pages for additional context.`,
    }),
    output: optional(
      option("-o", "--output", path({ metavar: "FILE" }), {
        description: message`Output file path. Writes to stdout if omitted.`,
      }),
    ),
    input: optional(
      argument(path({ metavar: "FILE" }), {
        description: message`Input file. Reads from stdin if omitted.`,
      }),
    ),
  }),
  {
    description: message`Translate text to another language using an LLM.`,
  },
);

/**
 * Parser for the "config model" subcommand.
 */
const configModelCommand = command(
  "model",
  object({
    subcommand: constant("model" as const),
    value: optional(
      argument(modelCode(), {
        description: message`Model to configure in provider:model format.`,
      }),
    ),
  }),
  {
    description: message`Get or set the default LLM model.`,
  },
);

/**
 * Parser for the "config api-key" subcommand.
 */
const configApiKeyCommand = command(
  "api-key",
  object({
    subcommand: constant("api-key" as const),
    provider: argument(
      choice(["openai", "anthropic", "google"] as const, {
        metavar: "PROVIDER",
      }),
      {
        description: message`Provider name.`,
      },
    ),
    key: optional(
      argument(string({ metavar: "KEY" }), {
        description: message`API key value. Prompts if omitted.`,
      }),
    ),
  }),
  {
    description: message`Get or set an API key for a provider.`,
  },
);

/**
 * Parser for the "config" subcommand with nested subcommands.
 */
export const configCommand = command(
  "config",
  object({
    command: constant("config" as const),
    action: or(configModelCommand, configApiKeyCommand),
  }),
  {
    description: message`Configure CLI settings such as model and API keys.`,
  },
);

/**
 * The main CLI parser combining all subcommands.
 */
export const parser = merge(globalOptions, or(translateCommand, configCommand));

/**
 * The inferred type for the translate command result.
 */
export type TranslateResult = InferValue<typeof translateCommand>;

/**
 * The inferred type for the config command result.
 */
export type ConfigResult = InferValue<typeof configCommand>;

/**
 * The inferred type for the CLI parser result.
 */
export type CliResult = InferValue<typeof parser>;
