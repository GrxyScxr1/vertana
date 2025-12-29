import { commandLine, message, metavar, text } from "@optique/core/message";
import { print } from "@optique/run";
import {
  getMaskedApiKey,
  loadConfig,
  type ProviderName,
  setApiKey,
  updateConfig,
} from "../config/index.ts";
import type { ConfigResult } from "../cli.ts";
import type { ParsedModelCode } from "../model.ts";

/**
 * Executes the config command.
 *
 * @param result The parsed config command result.
 */
export function executeConfig(result: ConfigResult): void {
  const { action } = result;

  switch (action.subcommand) {
    case "model":
      handleModelConfig(action.value);
      break;
    case "api-key":
      handleApiKeyConfig(action.provider, action.key);
      break;
  }
}

/**
 * Formats a parsed model code back to string.
 *
 * @param model The parsed model code.
 * @returns The model code string in "provider:model" format.
 */
function formatModelCode(model: ParsedModelCode): string {
  return `${model.provider}:${model.modelId}`;
}

/**
 * Handles the "config model" subcommand.
 *
 * @param value The model value to set, or undefined to get the current value.
 */
function handleModelConfig(value: ParsedModelCode | undefined): void {
  if (value == null) {
    // Get current model
    const config = loadConfig();
    if (config.model == null) {
      print(message`No model configured.`);
      print(
        message`Use ${commandLine("vertana config model")} ${
          metavar("PROVIDER:MODEL")
        } to set one.`,
      );
    } else {
      print(message`${text(config.model)}`);
    }
  } else {
    // Set model (already validated by CLI parser)
    const code = formatModelCode(value);
    updateConfig("model", code);
    print(message`Model set to: ${text(code)}`);
  }
}

/**
 * Handles the "config api-key" subcommand.
 *
 * @param provider The provider name.
 * @param key The API key to set, or undefined to get the current value.
 */
function handleApiKeyConfig(
  provider: ProviderName,
  key: string | undefined,
): void {
  if (key == null) {
    // Get current API key (masked)
    const masked = getMaskedApiKey(provider);
    if (masked == null) {
      print(message`No API key configured for ${text(provider)}.`);
      print(
        message`Use ${commandLine(`vertana config api-key ${provider}`)} ${
          metavar("KEY")
        } to set one.`,
      );
    } else {
      print(message`${text(masked)}`);
    }
  } else {
    // Set API key
    setApiKey(provider, key);
    print(message`API key for ${text(provider)} has been saved.`);
  }
}
