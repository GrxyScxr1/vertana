import type { PassiveContextSource } from "@vertana/core";
import { toJsonSchema } from "@standard-community/standard-json";
import { jsonSchema, tool, type ToolSet } from "ai";
import type { JSONSchema7 } from "ai";

/**
 * Converts passive context sources to AI SDK tool definitions.
 *
 * @param sources The passive context sources to convert.
 * @param signal Optional abort signal.
 * @returns A record of tool definitions keyed by source name.
 */
export async function convertToTools(
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
