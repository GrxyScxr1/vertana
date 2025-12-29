import { describe, it } from "./test-compat.ts";
import assert from "node:assert/strict";
import type { LanguageModel } from "ai";
import { selectBest } from "./select.ts";
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
    "selectBest",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("selects the best translation from candidates", async () => {
        const model = await getModel();

        const result = await selectBest(
          model,
          "Hello, world!",
          [
            { text: "안녕하세요, 세계!" }, // Good translation
            { text: "안녕" }, // Too short/incomplete
          ],
          { targetLanguage: "ko" },
        );

        assert.equal(result.best.rank, 1);
        assert.ok(result.best.score >= 0 && result.best.score <= 1);
        assert.equal(result.all.length, 2);
      });

      it("ranks candidates by score in descending order", async () => {
        const model = await getModel();

        const result = await selectBest(
          model,
          "Thank you very much for your help.",
          [
            { text: "감사합니다." }, // Okay but brief
            { text: "도움 주셔서 정말 감사합니다." }, // More complete
            { text: "고마워" }, // Too casual/incomplete
          ],
          { targetLanguage: "ko" },
        );

        // Verify ranks are 1, 2, 3
        assert.deepEqual(
          result.all.map((c) => c.rank),
          [1, 2, 3],
        );

        // Verify scores are in descending order
        for (let i = 1; i < result.all.length; i++) {
          assert.ok(
            result.all[i - 1].score >= result.all[i].score,
            `Score at rank ${i} should be >= score at rank ${i + 1}`,
          );
        }
      });

      it("preserves metadata in ranked candidates", async () => {
        const model = await getModel();

        interface TestMetadata {
          modelName: string;
        }

        const result = await selectBest<TestMetadata>(
          model,
          "Good morning!",
          [
            { text: "좋은 아침입니다!", metadata: { modelName: "model-a" } },
            { text: "좋은 아침!", metadata: { modelName: "model-b" } },
          ],
          { targetLanguage: "ko" },
        );

        // All candidates should have their metadata preserved
        for (const candidate of result.all) {
          assert.ok(candidate.metadata != null);
          assert.ok(candidate.metadata.modelName.startsWith("model-"));
        }

        // Best should have metadata
        assert.ok(result.best.metadata != null);
      });

      it("throws error when no candidates provided", async () => {
        const model = await getModel();

        await assert.rejects(
          async () => {
            await selectBest(model, "Hello", [], { targetLanguage: "ko" });
          },
          /At least one candidate is required/,
        );
      });

      it("respects abort signal", async () => {
        const model = await getModel();
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(
          async () => {
            await selectBest(
              model,
              "Hello",
              [{ text: "안녕" }],
              { targetLanguage: "ko", signal: controller.signal },
            );
          },
          (error: Error) => {
            return error.name === "AbortError" ||
              error.message.includes("abort");
          },
        );
      });

      it("uses glossary in evaluation", async () => {
        const model = await getModel();

        const result = await selectBest(
          model,
          "Machine learning is important.",
          [
            { text: "기계 학습이 중요합니다." }, // Follows glossary
            { text: "머신러닝이 중요합니다." }, // Doesn't follow glossary
          ],
          {
            targetLanguage: "ko",
            glossary: [
              { original: "machine learning", translated: "기계 학습" },
            ],
          },
        );

        // The one following glossary should rank higher
        assert.ok(
          result.best.text.includes("기계 학습"),
          "Best should use glossary term",
        );
      });

      it("includes issues in ranked candidates", async () => {
        const model = await getModel();

        const result = await selectBest(
          model,
          "The quick brown fox jumps over the lazy dog.",
          [
            { text: "빠른 갈색 여우가 게으른 개를 뛰어넘습니다." },
            { text: "고양이" }, // Completely wrong
          ],
          { targetLanguage: "ko" },
        );

        // All candidates should have issues array (even if empty)
        for (const candidate of result.all) {
          assert.ok(Array.isArray(candidate.issues));
        }
      });

      it("handles single candidate", async () => {
        const model = await getModel();

        const result = await selectBest(
          model,
          "Hello!",
          [{ text: "안녕하세요!" }],
          { targetLanguage: "ko" },
        );

        assert.equal(result.all.length, 1);
        assert.equal(result.best.rank, 1);
        assert.equal(result.best.text, "안녕하세요!");
      });
    },
  );
}
