import { describe, it } from "./test-compat.ts";
import assert from "node:assert/strict";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  combineContextResults,
  type ContextResult,
  type ContextSource,
  gatherRequiredContext,
} from "./context.ts";

/**
 * Creates a mock StandardSchema for testing passive context sources.
 */
function createMockSchema(): StandardSchemaV1<unknown> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => ({ value }),
    },
  };
}

describe("gatherRequiredContext", () => {
  it("returns empty array when no sources provided", async () => {
    const results = await gatherRequiredContext([]);
    assert.deepEqual(results, []);
  });

  it("returns empty array when no required sources", async () => {
    const sources: ContextSource[] = [
      {
        name: "passive-source",
        description: "A passive source",
        mode: "passive",
        parameters: createMockSchema(),
        gather: () => Promise.resolve({ content: "should not be called" }),
      },
    ];

    const results = await gatherRequiredContext(sources);
    assert.deepEqual(results, []);
  });

  it("gathers from required sources only", async () => {
    let passiveCalled = false;
    const sources: ContextSource[] = [
      {
        name: "required-source",
        description: "A required source",
        mode: "required",
        gather: () => Promise.resolve({ content: "required content" }),
      },
      {
        name: "passive-source",
        description: "A passive source",
        mode: "passive",
        parameters: createMockSchema(),
        gather: () => {
          passiveCalled = true;
          return Promise.resolve({ content: "passive content" });
        },
      },
    ];

    const results = await gatherRequiredContext(sources);

    assert.equal(results.length, 1);
    assert.equal(results[0].content, "required content");
    assert.ok(!passiveCalled, "Passive source should not be called");
  });

  it("gathers from multiple required sources in order", async () => {
    const callOrder: string[] = [];
    const sources: ContextSource[] = [
      {
        name: "source-1",
        description: "First source",
        mode: "required",
        gather: () => {
          callOrder.push("source-1");
          return Promise.resolve({ content: "content 1" });
        },
      },
      {
        name: "source-2",
        description: "Second source",
        mode: "required",
        gather: () => {
          callOrder.push("source-2");
          return Promise.resolve({ content: "content 2" });
        },
      },
    ];

    const results = await gatherRequiredContext(sources);

    assert.equal(results.length, 2);
    assert.deepEqual(callOrder, ["source-1", "source-2"]);
    assert.equal(results[0].content, "content 1");
    assert.equal(results[1].content, "content 2");
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const sources: ContextSource[] = [
      {
        name: "source",
        description: "A source",
        mode: "required",
        gather: () => Promise.resolve({ content: "content" }),
      },
    ];

    await assert.rejects(
      async () => {
        await gatherRequiredContext(sources, controller.signal);
      },
      { name: "AbortError" },
    );
  });

  it("passes signal to source gather function", async () => {
    let receivedSignal: AbortSignal | undefined;
    const controller = new AbortController();

    const sources: ContextSource[] = [
      {
        name: "source",
        description: "A source",
        mode: "required",
        gather: (options) => {
          receivedSignal = options?.signal;
          return Promise.resolve({ content: "content" });
        },
      },
    ];

    await gatherRequiredContext(sources, controller.signal);
    assert.equal(receivedSignal, controller.signal);
  });

  it("preserves metadata in results", async () => {
    const sources: ContextSource[] = [
      {
        name: "source-with-metadata",
        description: "A source with metadata",
        mode: "required",
        gather: () =>
          Promise.resolve({
            content: "content",
            metadata: { key: "value", count: 42 },
          }),
      },
    ];

    const results = await gatherRequiredContext(sources);

    assert.equal(results.length, 1);
    assert.deepEqual(results[0].metadata, { key: "value", count: 42 });
  });
});

describe("combineContextResults", () => {
  it("returns empty string for empty results", () => {
    const combined = combineContextResults([]);
    assert.equal(combined, "");
  });

  it("returns single result content as-is", () => {
    const results: ContextResult[] = [{ content: "single content" }];
    const combined = combineContextResults(results);
    assert.equal(combined, "single content");
  });

  it("joins multiple results with double newlines", () => {
    const results: ContextResult[] = [
      { content: "first" },
      { content: "second" },
      { content: "third" },
    ];
    const combined = combineContextResults(results);
    assert.equal(combined, "first\n\nsecond\n\nthird");
  });

  it("filters out empty content", () => {
    const results: ContextResult[] = [
      { content: "first" },
      { content: "" },
      { content: "second" },
    ];
    const combined = combineContextResults(results);
    assert.equal(combined, "first\n\nsecond");
  });

  it("filters out whitespace-only content", () => {
    const results: ContextResult[] = [
      { content: "first" },
      { content: "   " },
      { content: "\n\t" },
      { content: "second" },
    ];
    const combined = combineContextResults(results);
    assert.equal(combined, "first\n\nsecond");
  });

  it("preserves whitespace within content", () => {
    const results: ContextResult[] = [
      { content: "line 1\nline 2" },
      { content: "  indented" },
    ];
    const combined = combineContextResults(results);
    assert.equal(combined, "line 1\nline 2\n\n  indented");
  });
});
