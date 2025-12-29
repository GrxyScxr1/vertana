import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LanguageModel } from "ai";
import {
  translateChunks,
  type TranslateChunksComplete,
  type TranslatedChunkEvent,
} from "./translate.ts";
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
    "translateChunks",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("translates a single chunk", async () => {
        const model = await getModel();

        const chunks = ["Hello, world!"];
        const events: (TranslatedChunkEvent | TranslateChunksComplete)[] = [];

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
          })
        ) {
          events.push(event);
        }

        // Should have one chunk event and one complete event
        assert.equal(events.length, 2);

        const chunkEvent = events[0];
        assert.equal(chunkEvent.type, "chunk");
        assert.equal((chunkEvent as TranslatedChunkEvent).index, 0);
        assert.ok(
          (chunkEvent as TranslatedChunkEvent).translation.length > 0,
          "Translation should not be empty",
        );
        assert.ok(
          (chunkEvent as TranslatedChunkEvent).tokensUsed > 0,
          "Should report tokens used",
        );

        const completeEvent = events[1];
        assert.equal(completeEvent.type, "complete");
        assert.equal(
          (completeEvent as TranslateChunksComplete).translations.length,
          1,
        );
        assert.ok(
          (completeEvent as TranslateChunksComplete).totalTokensUsed > 0,
          "Should report total tokens used",
        );
      });

      it("translates multiple chunks with context", async () => {
        const model = await getModel();

        const chunks = [
          "The API uses REST endpoints.",
          "Authentication requires tokens.",
        ];
        const events: (TranslatedChunkEvent | TranslateChunksComplete)[] = [];

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
          })
        ) {
          events.push(event);
        }

        // Should have two chunk events and one complete event
        assert.equal(events.length, 3);

        const chunk1 = events[0] as TranslatedChunkEvent;
        const chunk2 = events[1] as TranslatedChunkEvent;
        const complete = events[2] as TranslateChunksComplete;

        assert.equal(chunk1.type, "chunk");
        assert.equal(chunk1.index, 0);

        assert.equal(chunk2.type, "chunk");
        assert.equal(chunk2.index, 1);

        assert.equal(complete.type, "complete");
        assert.equal(complete.translations.length, 2);
        assert.equal(complete.translations[0], chunk1.translation);
        assert.equal(complete.translations[1], chunk2.translation);
      });

      it("accumulates glossary terms when dynamic glossary is enabled", async () => {
        const model = await getModel();

        const chunks = [
          "Machine learning uses neural networks.",
          "Neural networks process data efficiently.",
        ];
        const events: (TranslatedChunkEvent | TranslateChunksComplete)[] = [];

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
            dynamicGlossary: { maxTermsPerChunk: 5 },
          })
        ) {
          events.push(event);
        }

        const complete = events[events.length - 1] as TranslateChunksComplete;
        assert.equal(complete.type, "complete");

        // With dynamic glossary enabled, some terms should be extracted
        // The exact terms depend on LLM behavior, so we just check structure
        assert.ok(
          Array.isArray(complete.accumulatedGlossary),
          "Should have accumulated glossary array",
        );
      });

      it("includes extracted terms in chunk events when dynamic glossary is enabled", async () => {
        const model = await getModel();

        const chunks = ["Software development requires programming skills."];

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
            dynamicGlossary: { maxTermsPerChunk: 3 },
          })
        ) {
          if (event.type === "chunk") {
            // extractedTerms may be present or empty depending on LLM
            assert.ok(
              event.extractedTerms === undefined ||
                Array.isArray(event.extractedTerms),
              "extractedTerms should be undefined or an array",
            );
          }
        }
      });

      it("respects abort signal", async () => {
        const model = await getModel();
        const controller = new AbortController();
        controller.abort();

        const chunks = ["Hello, world!"];

        await assert.rejects(
          async () => {
            for await (
              const _event of translateChunks(chunks, {
                targetLanguage: "ko",
                models: [model],
                signal: controller.signal,
              })
            ) {
              // Should not reach here
            }
          },
          { name: "AbortError" },
        );
      });

      it("respects source language option", async () => {
        const model = await getModel();

        const chunks = ["Hello, world!"];
        let translatedText = "";

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            sourceLanguage: "en",
            models: [model],
          })
        ) {
          if (event.type === "chunk") {
            translatedText = event.translation;
          }
        }

        assert.ok(translatedText.length > 0, "Should produce translation");
      });

      it("respects tone option", async () => {
        const model = await getModel();

        const chunks = ["Please help me with this task."];
        let translatedText = "";

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            tone: "formal",
            models: [model],
          })
        ) {
          if (event.type === "chunk") {
            translatedText = event.translation;
          }
        }

        assert.ok(translatedText.length > 0, "Should produce translation");
      });

      it("includes initial glossary in translation", async () => {
        const model = await getModel();

        const chunks = ["The API endpoint returns data."];

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
            glossary: [
              { original: "API", translated: "에이피아이" },
              { original: "endpoint", translated: "엔드포인트" },
            ],
          })
        ) {
          if (event.type === "chunk") {
            // The LLM should follow glossary, but we can't guarantee exact output
            assert.ok(
              event.translation.length > 0,
              "Should produce translation",
            );
          }
        }
      });

      it("yields events in correct order", async () => {
        const model = await getModel();

        const chunks = ["First chunk.", "Second chunk.", "Third chunk."];
        const chunkIndices: number[] = [];
        let completeReceived = false;

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
          })
        ) {
          if (event.type === "chunk") {
            assert.ok(
              !completeReceived,
              "Should not receive chunk after complete",
            );
            chunkIndices.push(event.index);
          } else {
            completeReceived = true;
          }
        }

        assert.deepEqual(chunkIndices, [0, 1, 2], "Chunks should be in order");
        assert.ok(completeReceived, "Should receive complete event");
      });

      it("performs best-of-N selection with multiple models", async () => {
        const model = await getModel();
        // Use the same model twice to exercise the best-of-N code path
        const models = [model, model];

        const chunks = ["Hello, world!"];
        const chunkEvents: TranslatedChunkEvent[] = [];

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models,
          })
        ) {
          if (event.type === "chunk") {
            chunkEvents.push(event);
          }
        }

        assert.equal(chunkEvents.length, 1);

        // With multiple models, best-of-N selection should occur
        const chunkEvent = chunkEvents[0];
        assert.ok(
          chunkEvent.selectedModel != null,
          "Should have selectedModel when using multiple models",
        );
        assert.ok(
          chunkEvent.qualityScore != null,
          "Should have qualityScore when using multiple models",
        );
        assert.ok(
          chunkEvent.qualityScore >= 0 && chunkEvent.qualityScore <= 1,
          "Quality score should be between 0 and 1",
        );
      });

      it("respects mediaType option for HTML", async () => {
        const model = await getModel();

        const chunks = ["<p>Hello, world!</p>"];
        let translatedText = "";

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
            mediaType: "text/html",
          })
        ) {
          if (event.type === "chunk") {
            translatedText = event.translation;
          }
        }

        assert.ok(translatedText.length > 0, "Should produce translation");
        // The LLM should preserve HTML structure, but we can't guarantee exact format
      });

      it("respects mediaType option for Markdown", async () => {
        const model = await getModel();

        const chunks = ["# Hello\n\nThis is **bold** text."];
        let translatedText = "";

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
            mediaType: "text/markdown",
          })
        ) {
          if (event.type === "chunk") {
            translatedText = event.translation;
          }
        }

        assert.ok(translatedText.length > 0, "Should produce translation");
        // The LLM should preserve Markdown structure
      });

      it("respects domain option", async () => {
        const model = await getModel();

        const chunks = ["The patient presents with acute symptoms."];
        let translatedText = "";

        for await (
          const event of translateChunks(chunks, {
            targetLanguage: "ko",
            models: [model],
            domain: "medical",
          })
        ) {
          if (event.type === "chunk") {
            translatedText = event.translation;
          }
        }

        assert.ok(translatedText.length > 0, "Should produce translation");
        // Medical domain should influence terminology choice
      });
    },
  );
}
