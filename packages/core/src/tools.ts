import { toJsonSchema } from "@standard-community/standard-json";
import { jsonSchema, tool, type ToolSet } from "ai";
import type { JSONSchema7 } from "ai";
import type { PassiveContextSource } from "./context.ts";

/**
 * Creates an AI SDK ToolSet from passive context sources.
 *
 * This function converts passive context sources into tool definitions that
 * can be used with the AI SDK's `generateText` or `streamText` functions.
 * The LLM can then invoke these tools during translation to gather additional
 * context on demand.
 *
 * @param sources The passive context sources to convert into tools.
 * @param signal Optional abort signal to cancel the operation.
 * @returns A promise that resolves to a ToolSet keyed by source name.
 */
export async function createToolSet(
  sources: readonly PassiveContextSource<unknown>[],
  signal?: AbortSignal,
): Promise<ToolSet> {
  const tools: ToolSet = {};

  for (const source of sources) {
    signal?.throwIfAborted();

    // Convert StandardSchema to JSON Schema
    const schema = await toJsonSchema(source.parameters);

    tools[source.name] = tool({
      description: source.description,
      inputSchema: jsonSchema(schema as JSONSchema7),
      execute: async (params: unknown) => {
        const result = await source.gather(params, { signal });
        return result.content;
      },
    });
  }

  return tools;
}
