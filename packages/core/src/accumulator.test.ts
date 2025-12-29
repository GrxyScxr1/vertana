import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LanguageModel } from "ai";
import {
  accumulateEvent,
  createInitialAccumulatorState,
  maxByValue,
} from "./accumulator.ts";
import type {
  TranslateChunksComplete,
  TranslatedChunkEvent,
} from "./translate.ts";

function createMockModel(id: string): LanguageModel {
  return { modelId: id } as LanguageModel;
}

function createChunkEvent(
  overrides: Partial<TranslatedChunkEvent> = {},
): TranslatedChunkEvent {
  return {
    type: "chunk",
    index: 0,
    translation: "translated text",
    tokensUsed: 100,
    ...overrides,
  };
}

function createCompleteEvent(
  overrides: Partial<TranslateChunksComplete> = {},
): TranslateChunksComplete {
  return {
    type: "complete",
    translations: ["translated text"],
    totalTokensUsed: 100,
    accumulatedGlossary: [],
    ...overrides,
  };
}

describe("createInitialAccumulatorState", () => {
  test("returns state with zero quality scores", () => {
    const state = createInitialAccumulatorState();

    assert.equal(state.totalQualityScore, 0);
    assert.equal(state.qualityScoreCount, 0);
  });

  test("returns state with empty model win counts", () => {
    const state = createInitialAccumulatorState();

    assert.equal(state.modelWinCounts.size, 0);
  });

  test("returns state without complete event", () => {
    const state = createInitialAccumulatorState();

    assert.equal(state.complete, undefined);
  });
});

describe("accumulateEvent", () => {
  describe("chunk events", () => {
    test("accumulates quality score when present", () => {
      const initial = createInitialAccumulatorState();
      const event = createChunkEvent({ qualityScore: 0.85 });

      const result = accumulateEvent(initial, event);

      assert.equal(result.totalQualityScore, 0.85);
      assert.equal(result.qualityScoreCount, 1);
    });

    test("accumulates quality score of 0 (falsy but valid)", () => {
      const initial = createInitialAccumulatorState();
      const event = createChunkEvent({ qualityScore: 0 });

      const result = accumulateEvent(initial, event);

      assert.equal(result.totalQualityScore, 0);
      assert.equal(result.qualityScoreCount, 1);
    });

    test("accumulates multiple quality scores", () => {
      let state = createInitialAccumulatorState();
      state = accumulateEvent(state, createChunkEvent({ qualityScore: 0.8 }));
      state = accumulateEvent(state, createChunkEvent({ qualityScore: 0.9 }));

      // Use approximate comparison due to floating point arithmetic
      assert.ok(Math.abs(state.totalQualityScore - 1.7) < 0.0001);
      assert.equal(state.qualityScoreCount, 2);
    });

    test("ignores chunk without quality score", () => {
      const initial = createInitialAccumulatorState();
      const event = createChunkEvent({ qualityScore: undefined });

      const result = accumulateEvent(initial, event);

      assert.equal(result.totalQualityScore, 0);
      assert.equal(result.qualityScoreCount, 0);
    });

    test("tracks model win count when selectedModel present", () => {
      const model = createMockModel("gpt-4o");
      const initial = createInitialAccumulatorState();
      const event = createChunkEvent({ selectedModel: model });

      const result = accumulateEvent(initial, event);

      assert.equal(result.modelWinCounts.get(model), 1);
    });

    test("increments win count for same model", () => {
      const model = createMockModel("gpt-4o");
      let state = createInitialAccumulatorState();
      state = accumulateEvent(
        state,
        createChunkEvent({ selectedModel: model }),
      );
      state = accumulateEvent(
        state,
        createChunkEvent({ selectedModel: model }),
      );

      assert.equal(state.modelWinCounts.get(model), 2);
    });

    test("tracks wins separately for different models", () => {
      const modelA = createMockModel("gpt-4o");
      const modelB = createMockModel("claude-3");
      let state = createInitialAccumulatorState();
      state = accumulateEvent(
        state,
        createChunkEvent({ selectedModel: modelA }),
      );
      state = accumulateEvent(
        state,
        createChunkEvent({ selectedModel: modelB }),
      );
      state = accumulateEvent(
        state,
        createChunkEvent({ selectedModel: modelA }),
      );

      assert.equal(state.modelWinCounts.get(modelA), 2);
      assert.equal(state.modelWinCounts.get(modelB), 1);
    });

    test("ignores chunk without selectedModel", () => {
      const initial = createInitialAccumulatorState();
      const event = createChunkEvent({ selectedModel: undefined });

      const result = accumulateEvent(initial, event);

      assert.equal(result.modelWinCounts.size, 0);
    });

    test("does not modify original state (immutability)", () => {
      const model = createMockModel("gpt-4o");
      const initial = createInitialAccumulatorState();
      const event = createChunkEvent({
        qualityScore: 0.9,
        selectedModel: model,
      });

      accumulateEvent(initial, event);

      assert.equal(initial.totalQualityScore, 0);
      assert.equal(initial.qualityScoreCount, 0);
      assert.equal(initial.modelWinCounts.size, 0);
    });
  });

  describe("complete events", () => {
    test("stores complete event", () => {
      const initial = createInitialAccumulatorState();
      const event = createCompleteEvent();

      const result = accumulateEvent(initial, event);

      assert.equal(result.complete, event);
    });

    test("preserves accumulated state when complete event arrives", () => {
      const model = createMockModel("gpt-4o");
      let state = createInitialAccumulatorState();
      state = accumulateEvent(
        state,
        createChunkEvent({
          qualityScore: 0.85,
          selectedModel: model,
        }),
      );
      state = accumulateEvent(state, createCompleteEvent());

      assert.equal(state.totalQualityScore, 0.85);
      assert.equal(state.qualityScoreCount, 1);
      assert.equal(state.modelWinCounts.get(model), 1);
    });
  });
});

describe("maxByValue", () => {
  test("returns undefined for empty map", () => {
    const map = new Map<string, number>();

    assert.equal(maxByValue(map), undefined);
  });

  test("returns the only key for single-entry map", () => {
    const map = new Map([["a", 5]]);

    assert.equal(maxByValue(map), "a");
  });

  test("returns key with highest value", () => {
    const map = new Map([
      ["a", 3],
      ["b", 7],
      ["c", 5],
    ]);

    assert.equal(maxByValue(map), "b");
  });

  test("returns first key when multiple keys have same max value", () => {
    const map = new Map([
      ["a", 5],
      ["b", 5],
    ]);

    // Map iteration order is insertion order, so "a" should be returned
    assert.equal(maxByValue(map), "a");
  });

  test("works with LanguageModel keys", () => {
    const modelA = createMockModel("gpt-4o");
    const modelB = createMockModel("claude-3");
    const map = new Map<LanguageModel, number>([
      [modelA, 2],
      [modelB, 5],
    ]);

    assert.equal(maxByValue(map), modelB);
  });
});
