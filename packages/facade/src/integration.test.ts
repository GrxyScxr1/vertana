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

  describe(
    "translate with refinement",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("returns quality score when refinement is enabled", async () => {
        const model = await getModel();

        const result = await translate(
          model,
          "ko",
          "Hello, world!",
          {
            refinement: {
              qualityThreshold: 0.7,
              maxIterations: 2,
            },
          },
        );

        assert.ok(result.qualityScore != null);
        assert.ok(result.qualityScore >= 0 && result.qualityScore <= 1);
        assert.ok(result.refinementIterations != null);
      });

      it("achieves target quality score", async () => {
        const model = await getModel();

        const result = await translate(
          model,
          "ko",
          "Thank you for your help.",
          {
            refinement: {
              qualityThreshold: 0.7,
              maxIterations: 3,
            },
          },
        );

        assert.ok(
          result.qualityScore != null && result.qualityScore >= 0.7,
          `Expected qualityScore >= 0.7, got ${result.qualityScore}`,
        );
      });

      it("reports refining progress", async () => {
        const model = await getModel();
        const progressStages: string[] = [];

        await translate(
          model,
          "ko",
          "Good morning!",
          {
            refinement: {
              qualityThreshold: 0.7,
              maxIterations: 1,
            },
            onProgress: (progress) => {
              if (!progressStages.includes(progress.stage)) {
                progressStages.push(progress.stage);
              }
            },
          },
        );

        assert.ok(
          progressStages.includes("refining"),
          "Should report refining progress stage",
        );
      });

      it("uses glossary during refinement", async () => {
        const model = await getModel();
        const glossary = [
          { original: "machine learning", translated: "기계 학습" },
        ];

        const result = await translate(
          model,
          "ko",
          "Machine learning is revolutionizing technology.",
          {
            glossary,
            refinement: {
              qualityThreshold: 0.8,
              maxIterations: 2,
            },
          },
        );

        // The refined translation should follow the glossary
        assert.ok(
          result.text.includes("기계 학습"),
          "Refined translation should use glossary term",
        );
      });
    },
  );

  describe(
    "best-of-N selection",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("selects best translation when multiple models provided", async () => {
        const model = await getModel();

        // Use the same model twice to test the selection mechanism
        const result = await translate(
          [model, model],
          "ko",
          "Hello, world!",
          { bestOfN: true },
        );

        // Should have text and selected model
        assert.ok(result.text.length > 0);
        assert.ok(result.selectedModel != null);
        assert.ok(result.qualityScore != null);
        assert.ok(
          result.qualityScore >= 0 && result.qualityScore <= 1,
          `Expected score between 0 and 1, got ${result.qualityScore}`,
        );
      });

      it("reports selecting progress stage", async () => {
        const model = await getModel();
        const stages: string[] = [];

        await translate(
          [model, model],
          "ko",
          "Good morning!",
          {
            bestOfN: true,
            onProgress: (progress) => {
              if (!stages.includes(progress.stage)) {
                stages.push(progress.stage);
              }
            },
          },
        );

        assert.ok(
          stages.includes("selecting"),
          `Should report selecting stage, got: ${stages.join(", ")}`,
        );
      });

      it("uses custom evaluator model", async () => {
        const model = await getModel();

        const result = await translate(
          [model, model],
          "ko",
          "Thank you for your help.",
          {
            bestOfN: {
              evaluatorModel: model,
            },
          },
        );

        assert.ok(result.selectedModel != null);
        assert.ok(result.qualityScore != null);
      });

      it("falls back to first model when bestOfN is disabled", async () => {
        const model = await getModel();

        const result = await translate(
          [model, model],
          "ko",
          "Hello!",
          // bestOfN is not set
        );

        // Should not have selectedModel when best-of-N is not enabled
        assert.ok(result.selectedModel == null);
        assert.ok(result.text.length > 0);
      });

      it("combines best-of-N selection with refinement", async () => {
        const model = await getModel();

        const result = await translate(
          [model, model],
          "ko",
          "The weather is nice today.",
          {
            bestOfN: true,
            refinement: {
              qualityThreshold: 0.7,
              maxIterations: 2,
            },
          },
        );

        assert.ok(result.selectedModel != null);
        assert.ok(result.qualityScore != null);
        assert.ok(result.refinementIterations != null);
      });
    },
  );

  describe(
    "chunking + refinement integration",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("refines multiple chunks with boundary evaluation", async () => {
        const model = await getModel();

        // Long text that will be chunked
        const longText = `
# Introduction to Artificial Intelligence

Artificial intelligence (AI) is transforming how we live and work.
From virtual assistants to self-driving cars, AI is everywhere.

# Machine Learning Basics

Machine learning is a subset of AI that enables computers to learn
from data without being explicitly programmed. It uses algorithms
to identify patterns and make decisions.

# Deep Learning

Deep learning uses neural networks with many layers to process
complex data. It has revolutionized image recognition and natural
language processing.
        `.trim();

        const glossary = [
          { original: "artificial intelligence", translated: "인공지능" },
          { original: "machine learning", translated: "기계 학습" },
          { original: "deep learning", translated: "심층 학습" },
        ];

        const result = await translate(
          model,
          "ko",
          longText,
          {
            glossary,
            mediaType: "text/markdown",
            refinement: {
              qualityThreshold: 0.7,
              maxIterations: 2,
            },
          },
        );

        // Should have quality score from refinement
        assert.ok(result.qualityScore != null);
        assert.ok(
          result.qualityScore >= 0.7,
          `Expected qualityScore >= 0.7, got ${result.qualityScore}`,
        );

        // Should use glossary terms
        assert.ok(
          result.text.includes("인공지능"),
          "Should use glossary term for AI",
        );
        assert.ok(
          result.text.includes("기계 학습"),
          "Should use glossary term for machine learning",
        );
      });

      it("reports progress through all stages including refinement", async () => {
        const model = await getModel();
        const stages: string[] = [];

        const longText = `
First paragraph about technology and innovation.

Second paragraph about science and discovery.
        `.trim();

        await translate(
          model,
          "ko",
          longText,
          {
            refinement: {
              qualityThreshold: 0.7,
              maxIterations: 1,
            },
            onProgress: (progress) => {
              if (!stages.includes(progress.stage)) {
                stages.push(progress.stage);
              }
            },
          },
        );

        // Should go through chunking, translating, and refining stages
        assert.ok(
          stages.includes("chunking"),
          "Should report chunking stage",
        );
        assert.ok(
          stages.includes("translating"),
          "Should report translating stage",
        );
        assert.ok(
          stages.includes("refining"),
          "Should report refining stage",
        );
      });
    },
  );
}
