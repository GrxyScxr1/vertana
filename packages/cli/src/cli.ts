import { merge, object, or } from "@optique/core/constructs";
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
    target: option("-t", "--target", string({ metavar: "LANG" })),
    source: optional(option("-s", "--source", string({ metavar: "LANG" }))),
    mediaType: withDefault(
      option(
        "-T",
        "--type",
        choice(["text/plain", "text/markdown", "text/html"] as const),
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
      ),
    ),
    domain: optional(option("--domain", string())),
    glossary: multiple(option("-g", "--glossary", glossaryEntry())),
    glossaryFile: optional(
      option("--glossary-file", path({ mustExist: true, type: "file" })),
    ),
    output: optional(option("-o", "--output", path({ metavar: "FILE" }))),
    input: optional(argument(path({ metavar: "FILE" }))),
  }),
);

/**
 * Parser for the "config model" subcommand.
 */
const configModelCommand = command(
  "model",
  object({
    subcommand: constant("model" as const),
    value: optional(argument(modelCode())),
  }),
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
    ),
    key: optional(argument(string({ metavar: "KEY" }))),
  }),
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
