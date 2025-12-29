import { describe, it } from "./test-compat.ts";
import assert from "node:assert/strict";
import { number, object, string } from "valibot";
import { createToolSet } from "./tools.ts";
import type { PassiveContextSource } from "./context.ts";

/**
 * Creates a mock passive context source for testing.
 */
function createMockPassiveSource(
  name: string,
  content: string,
): PassiveContextSource<{ query: string }> {
  return {
    name,
    description: `Mock source: ${name}`,
    mode: "passive",
    parameters: object({ query: string() }),
    gather: (params) =>
      Promise.resolve({
        content: `${content}: ${params.query}`,
      }),
  };
}

describe("createToolSet", () => {
  it("returns empty object for empty sources", async () => {
    const tools = await createToolSet([]);
    assert.deepEqual(tools, {});
  });

  it("creates tools from passive sources", async () => {
    const sources = [
      createMockPassiveSource("source-1", "Result 1"),
      createMockPassiveSource("source-2", "Result 2"),
    ];

    const tools = await createToolSet(sources);

    assert.ok("source-1" in tools, "Should have source-1 tool");
    assert.ok("source-2" in tools, "Should have source-2 tool");
  });

  it("tool executes source gather function", async () => {
    const sources = [createMockPassiveSource("test-source", "Response")];

    const tools = await createToolSet(sources);
    const tool = tools["test-source"];
    assert.ok(tool != null, "Tool should exist");
    assert.ok(tool.execute != null, "Tool execute should exist");

    // The tool's execute function should call the source's gather
    const result = await tool.execute({ query: "hello" }, {
      toolCallId: "test",
      messages: [],
    });

    assert.equal(result, "Response: hello");
  });

  it("preserves source description in tool", async () => {
    const sources = [createMockPassiveSource("my-source", "Content")];

    const tools = await createToolSet(sources);
    const tool = tools["my-source"];

    assert.equal(tool.description, "Mock source: my-source");
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const sources = [createMockPassiveSource("source", "Content")];

    await assert.rejects(
      async () => {
        await createToolSet(sources, controller.signal);
      },
      { name: "AbortError" },
    );
  });

  it("handles multiple sources with different schemas", async () => {
    const source1: PassiveContextSource<{ id: number }> = {
      name: "numeric-source",
      description: "Source with numeric param",
      mode: "passive",
      parameters: object({ id: number() }),
      gather: (params) => Promise.resolve({ content: `ID: ${params.id}` }),
    };

    const source2: PassiveContextSource<{ text: string }> = {
      name: "text-source",
      description: "Source with text param",
      mode: "passive",
      parameters: object({ text: string() }),
      gather: (params) => Promise.resolve({ content: `Text: ${params.text}` }),
    };

    const tools = await createToolSet([source1, source2]);

    const numericTool = tools["numeric-source"];
    const textTool = tools["text-source"];
    assert.ok(numericTool != null, "Numeric tool should exist");
    assert.ok(textTool != null, "Text tool should exist");
    assert.ok(numericTool.execute != null, "Numeric tool execute should exist");
    assert.ok(textTool.execute != null, "Text tool execute should exist");

    const result1 = await numericTool.execute({ id: 42 }, {
      toolCallId: "test1",
      messages: [],
    });
    const result2 = await textTool.execute({ text: "hello" }, {
      toolCallId: "test2",
      messages: [],
    });

    assert.equal(result1, "ID: 42");
    assert.equal(result2, "Text: hello");
  });
});
