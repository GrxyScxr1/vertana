import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LanguageModel } from "ai";
import type { AccumulatorState, TranslateChunksComplete } from "@vertana/core";
import { buildTranslation, type BuildTranslationOptions } from "./result.ts";

function createMockModel(id: string): LanguageModel {
  return { modelId: id } as LanguageModel;
}

function createCompleteEvent(
  overrides: Partial<TranslateChunksComplete> = {},
): TranslateChunksComplete {
  return {
    type: "complete",
    translations: ["Hello, world!"],
    totalTokensUsed: 100,
    accumulatedGlossary: [],
    ...overrides,
  };
}

function createAccumulatorState(
  overrides: Partial<AccumulatorState> = {},
): AccumulatorState {
  return {
    totalQualityScore: 0,
    qualityScoreCount: 0,
    modelWinCounts: new Map(),
    ...overrides,
  };
}

describe("buildTranslation", () => {
  describe("error handling", () => {
    test("throws Error when complete event is missing", () => {
      const state = createAccumulatorState({ complete: undefined });
      const options: BuildTranslationOptions = { startTime: 0 };

      assert.throws(
        () => buildTranslation(state, options),
        { message: "Translation did not complete." },
      );
    });
  });

  describe("text assembly", () => {
    test("returns single translation as text", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({
          translations: ["Hello, world!"],
        }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.text, "Hello, world!");
    });

    test("joins multiple translations with double newline", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({
          translations: ["First paragraph.", "Second paragraph."],
        }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.text, "First paragraph.\n\nSecond paragraph.");
    });

    test("returns empty string for empty translations array", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({
          translations: [],
        }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.text, "");
    });
  });

  describe("title extraction", () => {
    test("extracts title when extractTitle is true", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({
          translations: ["Title: My Title\n\nContent here."],
        }),
      });

      const result = buildTranslation(state, {
        startTime: 0,
        extractTitle: true,
      });

      assert.equal(result.title, "My Title");
    });

    test("does not extract title when extractTitle is false", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({
          translations: ["# My Title\n\nContent here."],
        }),
      });

      const result = buildTranslation(state, {
        startTime: 0,
        extractTitle: false,
      });

      assert.equal(result.title, undefined);
    });

    test("does not extract title when extractTitle is undefined", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({
          translations: ["# My Title\n\nContent here."],
        }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.title, undefined);
    });
  });

  describe("token usage", () => {
    test("includes total tokens used", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ totalTokensUsed: 500 }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.tokenUsed, 500);
    });

    test("handles zero tokens used", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ totalTokensUsed: 0 }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.tokenUsed, 0);
    });
  });

  describe("processing time", () => {
    test("calculates processing time from startTime", () => {
      const startTime = performance.now() - 1000; // 1 second ago
      const state = createAccumulatorState({
        complete: createCompleteEvent(),
      });

      const result = buildTranslation(state, { startTime });

      // Should be approximately 1000ms, allow some tolerance
      assert.ok(result.processingTime >= 990);
      assert.ok(result.processingTime <= 1100);
    });
  });

  describe("quality score", () => {
    test("uses refinement quality score when available", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ qualityScore: 0.95 }),
        totalQualityScore: 2.4,
        qualityScoreCount: 3,
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.qualityScore, 0.95);
    });

    test("uses refinement quality score of 0 (falsy but valid)", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ qualityScore: 0 }),
        totalQualityScore: 2.4,
        qualityScoreCount: 3,
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.qualityScore, 0);
    });

    test("calculates average when refinement score not available", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ qualityScore: undefined }),
        totalQualityScore: 2.4,
        qualityScoreCount: 3,
      });

      const result = buildTranslation(state, { startTime: 0 });

      // Use approximate comparison due to floating point arithmetic
      assert.ok(result.qualityScore != null);
      assert.ok(Math.abs(result.qualityScore - 0.8) < 0.0001);
    });

    test("returns undefined when no quality scores available", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ qualityScore: undefined }),
        totalQualityScore: 0,
        qualityScoreCount: 0,
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.qualityScore, undefined);
    });
  });

  describe("refinement iterations", () => {
    test("includes refinement iterations when present", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ refinementIterations: 2 }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.refinementIterations, 2);
    });

    test("omits refinement iterations when not present", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ refinementIterations: undefined }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.refinementIterations, undefined);
    });
  });

  describe("selected model", () => {
    test("returns model with most wins", () => {
      const modelA = createMockModel("gpt-4o");
      const modelB = createMockModel("claude-3");
      const state = createAccumulatorState({
        complete: createCompleteEvent(),
        modelWinCounts: new Map([
          [modelA, 2],
          [modelB, 5],
        ]),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.selectedModel, modelB);
    });

    test("returns undefined when no model wins recorded", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent(),
        modelWinCounts: new Map(),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.selectedModel, undefined);
    });
  });

  describe("accumulated glossary", () => {
    test("includes accumulated glossary when non-empty", () => {
      const glossary = [
        { original: "hello", translated: "안녕" },
        { original: "world", translated: "세계" },
      ];
      const state = createAccumulatorState({
        complete: createCompleteEvent({ accumulatedGlossary: glossary }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.deepEqual(result.accumulatedGlossary, glossary);
    });

    test("omits accumulated glossary when empty", () => {
      const state = createAccumulatorState({
        complete: createCompleteEvent({ accumulatedGlossary: [] }),
      });

      const result = buildTranslation(state, { startTime: 0 });

      assert.equal(result.accumulatedGlossary, undefined);
    });
  });
});
