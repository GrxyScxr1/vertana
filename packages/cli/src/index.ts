import process from "node:process";
import { configure } from "@logtape/logtape";
import { commandLine, message, text } from "@optique/core/message";
import { createLoggingConfig } from "@optique/logtape";
import { printError, run } from "@optique/run";
import { type CliResult, parser } from "./cli.ts";
import { executeConfig } from "./commands/config.ts";
import { executeTranslate } from "./commands/translate.ts";

/**
 * The CLI entry point.
 */
export async function main(): Promise<void> {
  const result = run(parser, {
    programName: "vertana",
    brief: message`LLM-powered translation CLI`,
    description:
      message`Translate text using large language models with support for
multiple providers (OpenAI, Anthropic, Google) and various options
for customizing the translation output.`,
    footer: message`Examples:

  ${commandLine("vertana translate -t ko input.txt")}

  ${commandLine("vertana translate -t ko -o output.txt input.txt")}

  ${commandLine('echo "Hello" | vertana translate -t ko')}

  ${commandLine("vertana config model openai:gpt-4o")}

  ${commandLine("vertana config api-key openai sk-...")}`,
    help: "both",
    version: "0.1.0",
    aboveError: "usage",
  }) as CliResult;

  // Configure logging based on verbosity level
  const loggingConfig = await createLoggingConfig(result.logging);
  await configure(loggingConfig);

  await executeCommand(result);
}

/**
 * Executes the parsed CLI command.
 *
 * @param result The parsed CLI result.
 */
async function executeCommand(result: CliResult): Promise<void> {
  switch (result.command) {
    case "translate":
      await executeTranslate(result);
      break;
    case "config":
      executeConfig(result);
      break;
  }
}

// Run the CLI when executed directly
if (
  "main" in import.meta && import.meta.main ||
  (typeof process !== "undefined" && process.argv[1]?.endsWith("index.ts")) ||
  (typeof process !== "undefined" && process.argv[1]?.endsWith("index.js")) ||
  (typeof process !== "undefined" && process.argv[1]?.endsWith("index.mjs")) ||
  (typeof process !== "undefined" && process.argv[1]?.endsWith("index.cjs"))
) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      printError(message`${text(error.message)}`, { exitCode: 1 });
    } else {
      printError(message`An unexpected error occurred.`, { exitCode: 1 });
    }
  });
}
