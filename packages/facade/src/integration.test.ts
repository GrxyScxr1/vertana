import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LanguageModel } from "ai";
import { evaluate } from "@vertana/core";
import { translate } from "./index.ts";
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
    "translate + evaluate integration",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("evaluates a translation with high score", async () => {
        const model = await getModel();

        // Translate text
        const translation = await translate(
          model,
          "ko",
          "The weather is beautiful today.",
        );

        // Evaluate the translation
        const evaluation = await evaluate(
          model,
          "The weather is beautiful today.",
          translation.text,
          { targetLanguage: "ko", sourceLanguage: "en" },
        );

        // A good LLM translation should score well
        assert.ok(
          evaluation.score >= 0.7,
          `Expected score >= 0.7, got ${evaluation.score}`,
        );
      });

      it("evaluates translation with glossary compliance", async () => {
        const model = await getModel();
        const glossary = [
          { original: "artificial intelligence", translated: "인공지능" },
        ];

        // Translate with glossary
        const translation = await translate(
          model,
          "ko",
          "Artificial intelligence is changing the world.",
          { glossary },
        );

        // Evaluate with the same glossary
        const evaluation = await evaluate(
          model,
          "Artificial intelligence is changing the world.",
          translation.text,
          { targetLanguage: "ko", sourceLanguage: "en", glossary },
        );

        // Should not have terminology issues when glossary is used
        const hasTerminologyIssue = evaluation.issues.some(
          (issue) => issue.type === "terminology",
        );
        assert.ok(
          !hasTerminologyIssue,
          "Should not have terminology issues when glossary is followed",
        );
      });
    },
  );
}
