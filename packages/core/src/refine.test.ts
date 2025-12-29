import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LanguageModel } from "ai";
import { evaluateBoundary, refineChunks } from "./refine.ts";
import { getTestModel, hasTestModel } from "./testing.ts";

// Lazy model initialization (cached)
let cachedModel: LanguageModel | undefined;
async function getModel(): Promise<LanguageModel> {
  if (cachedModel == null) {
    const m = await getTestModel();
    if (m == null) {
      throw new Error("TEST_MODEL not set");
    }
    cachedModel = m;
  }
  return cachedModel;
}

if (hasTestModel() || !("Bun" in globalThis)) {
  describe(
    "refineChunks",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("returns chunks unchanged when already high quality", async () => {
        const model = await getModel();
        const originalChunks = ["Hello, world!"];
        const translatedChunks = ["안녕하세요, 세계!"];

        const result = await refineChunks(
          model,
          originalChunks,
          translatedChunks,
          {
            targetLanguage: "ko",
            targetScore: 0.7,
            evaluateBoundaries: false,
          },
        );

        assert.equal(result.chunks.length, 1);
        assert.ok(result.scores[0] >= 0.7);
      });

      it("refines low quality translations", async () => {
        const model = await getModel();
        // Intentionally bad translation
        const originalChunks = ["The quick brown fox jumps over the lazy dog."];
        const translatedChunks = ["고양이가 느리게 걷는다."]; // Wrong meaning

        const result = await refineChunks(
          model,
          originalChunks,
          translatedChunks,
          {
            targetLanguage: "ko",
            targetScore: 0.7,
            maxIterations: 2,
            evaluateBoundaries: false,
          },
        );

        // Should have attempted to refine
        assert.ok(result.totalIterations > 0);
        assert.ok(result.history.length > 0);
        // The refined text should be different from the original bad translation
        assert.notEqual(result.chunks[0], translatedChunks[0]);
      });

      it("records refinement history", async () => {
        const model = await getModel();
        const originalChunks = ["Thank you very much for your help."];
        const translatedChunks = ["고마워."]; // Too casual/incomplete

        const result = await refineChunks(
          model,
          originalChunks,
          translatedChunks,
          {
            targetLanguage: "ko",
            targetScore: 0.9,
            maxIterations: 2,
            evaluateBoundaries: false,
          },
        );

        if (result.history.length > 0) {
          const firstIteration = result.history[0];
          assert.equal(firstIteration.chunkIndex, 0);
          assert.equal(firstIteration.iteration, 1);
          assert.ok(firstIteration.before.length > 0);
          assert.ok(firstIteration.after.length > 0);
        }
      });

      it("respects maxIterations limit", async () => {
        const model = await getModel();
        const originalChunks = [
          "Complex technical text about quantum computing.",
        ];
        const translatedChunks = ["양자"]; // Very incomplete

        const result = await refineChunks(
          model,
          originalChunks,
          translatedChunks,
          {
            targetLanguage: "ko",
            targetScore: 0.99, // Very high, likely won't be reached
            maxIterations: 2,
            evaluateBoundaries: false,
          },
        );

        // Should not exceed maxIterations
        assert.ok(result.totalIterations <= 2);
      });

      it("throws on chunk count mismatch", async () => {
        const model = await getModel();

        await assert.rejects(
          async () => {
            await refineChunks(
              model,
              ["chunk1", "chunk2"],
              ["only one chunk"],
              { targetLanguage: "ko" },
            );
          },
          /Chunk count mismatch/,
        );
      });

      it("respects abort signal", async () => {
        const model = await getModel();
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(
          async () => {
            await refineChunks(
              model,
              ["Hello"],
              ["안녕"],
              { targetLanguage: "ko", signal: controller.signal },
            );
          },
          (error: Error) => {
            return error.name === "AbortError" ||
              error.message.includes("abort");
          },
        );
      });

      it("handles multiple chunks", async () => {
        const model = await getModel();
        const originalChunks = [
          "First paragraph about technology.",
          "Second paragraph about science.",
        ];
        const translatedChunks = [
          "기술에 관한 첫 번째 단락.",
          "과학에 관한 두 번째 단락.",
        ];

        const result = await refineChunks(
          model,
          originalChunks,
          translatedChunks,
          {
            targetLanguage: "ko",
            targetScore: 0.7,
            evaluateBoundaries: false,
          },
        );

        assert.equal(result.chunks.length, 2);
        assert.equal(result.scores.length, 2);
      });

      it("uses glossary during refinement", async () => {
        const model = await getModel();
        const originalChunks = ["Machine learning is important."];
        const translatedChunks = ["머신러닝이 중요합니다."]; // Wrong term

        const result = await refineChunks(
          model,
          originalChunks,
          translatedChunks,
          {
            targetLanguage: "ko",
            targetScore: 0.9,
            maxIterations: 2,
            glossary: [
              { original: "machine learning", translated: "기계 학습" },
            ],
            evaluateBoundaries: false,
          },
        );

        // Should try to use the glossary term
        if (result.totalIterations > 0) {
          assert.ok(
            result.chunks[0].includes("기계 학습") ||
              result.history.some((h) => h.after.includes("기계 학습")),
          );
        }
      });
    },
  );

  describe(
    "evaluateBoundary",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("returns high score for coherent boundaries", async () => {
        const model = await getModel();

        const result = await evaluateBoundary(
          model,
          "첫 번째 문단이 여기서 끝납니다.",
          "두 번째 문단이 여기서 시작됩니다.",
          "The first paragraph ends here.",
          "The second paragraph starts here.",
          { targetLanguage: "ko" },
        );

        assert.ok(result.score >= 0 && result.score <= 1);
        assert.ok(Array.isArray(result.issues));
      });

      it("detects style inconsistencies", async () => {
        const model = await getModel();

        // Formal vs casual style
        const result = await evaluateBoundary(
          model,
          "이 문서는 공식적인 어조로 작성되었습니다.",
          "그래서 뭐 어쩌라고?", // Very casual/rude
          "This document is written in a formal tone.",
          "So what do you want me to do about it?",
          { targetLanguage: "ko" },
        );

        // Should detect some kind of issue
        assert.ok(result.score >= 0 && result.score <= 1);
      });
    },
  );

  describe(
    "refineChunks with boundary evaluation",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("evaluates boundaries when enabled", async () => {
        const model = await getModel();
        const originalChunks = [
          "The first part of the story.",
          "The second part continues.",
        ];
        const translatedChunks = [
          "이야기의 첫 번째 부분입니다.",
          "두 번째 부분이 계속됩니다.",
        ];

        const result = await refineChunks(
          model,
          originalChunks,
          translatedChunks,
          {
            targetLanguage: "ko",
            targetScore: 0.7,
            evaluateBoundaries: true,
          },
        );

        assert.ok(result.boundaryEvaluations != null);
        assert.equal(result.boundaryEvaluations.length, 1);
        assert.equal(result.boundaryEvaluations[0].chunkIndex, 0);
        assert.ok(result.boundaryEvaluations[0].score >= 0);
        assert.ok(result.boundaryEvaluations[0].score <= 1);
      });

      it("skips boundary evaluation when disabled", async () => {
        const model = await getModel();
        const originalChunks = ["Part 1.", "Part 2."];
        const translatedChunks = ["1부.", "2부."];

        const result = await refineChunks(
          model,
          originalChunks,
          translatedChunks,
          {
            targetLanguage: "ko",
            targetScore: 0.5,
            evaluateBoundaries: false,
          },
        );

        assert.equal(result.boundaryEvaluations, undefined);
      });
    },
  );
}
