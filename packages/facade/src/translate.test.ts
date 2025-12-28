import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LanguageModel } from "ai";
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

// Bun's node:test compatibility doesn't support skip option,
// so we skip defining tests entirely when TEST_MODEL is not set in Bun
if (hasTestModel() || !("Bun" in globalThis)) {
  describe(
    "translate",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("translates text to the target language", async () => {
        const model = await getModel();
        const result = await translate(model, "ko", "Hello, world!");

        // The result should contain Korean text
        assert.ok(result.text.length > 0);
        // Common Korean translations of "Hello, world!"
        assert.ok(
          result.text.includes("안녕") ||
            result.text.includes("세계") ||
            result.text.includes("월드"),
          `Expected Korean translation, got: ${result.text}`,
        );
      });

      it("translates with source language specified", async () => {
        const model = await getModel();
        const result = await translate(model, "ja", "Hello, world!", {
          sourceLanguage: "en",
        });

        assert.ok(result.text.length > 0);
        // Should contain Japanese characters
        assert.ok(
          /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(result.text),
          `Expected Japanese translation, got: ${result.text}`,
        );
      });

      it("translates with formal tone", async () => {
        const model = await getModel();
        const result = await translate(model, "ko", "How are you?", {
          tone: "formal",
        });

        assert.ok(result.text.length > 0);
      });

      it("translates with domain context", async () => {
        const model = await getModel();
        const result = await translate(
          model,
          "ko",
          "The patient presents with acute myocardial infarction.",
          { domain: "medical" },
        );

        assert.ok(result.text.length > 0);
        // Should contain medical terminology in Korean
        assert.ok(
          result.text.includes("심근") || result.text.includes("경색"),
          `Expected medical terminology, got: ${result.text}`,
        );
      });

      it("preserves markdown formatting", async () => {
        const model = await getModel();
        const markdown = "# Hello\n\nThis is **bold** and *italic*.";
        const result = await translate(model, "ko", markdown, {
          mediaType: "text/markdown",
        });

        assert.ok(result.text.includes("#"));
        assert.ok(result.text.includes("**"));
        assert.ok(result.text.includes("*"));
      });

      it("uses glossary for consistent terminology", async () => {
        const model = await getModel();
        const result = await translate(
          model,
          "ko",
          "Machine learning is a subset of artificial intelligence.",
          {
            glossary: [
              { original: "machine learning", translated: "기계 학습" },
              { original: "artificial intelligence", translated: "인공 지능" },
            ],
          },
        );

        assert.ok(result.text.includes("기계 학습"));
        assert.ok(result.text.includes("인공 지능"));
      });

      it("reports token usage", async () => {
        const model = await getModel();
        const result = await translate(model, "ko", "Hello, world!");

        assert.ok(typeof result.tokenUsed === "number");
        assert.ok(result.tokenUsed >= 0);
      });

      it("reports processing time", async () => {
        const model = await getModel();
        const result = await translate(model, "ko", "Hello, world!");

        assert.ok(typeof result.processingTime === "number");
        assert.ok(result.processingTime > 0);
      });

      it("calls onProgress callback", async () => {
        const model = await getModel();
        const progressCalls: Array<{ stage: string; progress: number }> = [];

        await translate(model, "ko", "Hello, world!", {
          chunker: null, // Disable chunking for this test
          onProgress: (progress) => {
            progressCalls.push({
              stage: progress.stage,
              progress: progress.progress,
            });
          },
        });

        assert.ok(progressCalls.length >= 2);
        assert.equal(progressCalls[0].stage, "translating");
        assert.equal(progressCalls[0].progress, 0);
        assert.equal(
          progressCalls[progressCalls.length - 1].stage,
          "translating",
        );
        assert.equal(progressCalls[progressCalls.length - 1].progress, 1);
      });

      it("handles Intl.Locale for target language", async () => {
        const model = await getModel();
        const result = await translate(
          model,
          new Intl.Locale("fr"),
          "Hello, world!",
        );

        assert.ok(result.text.length > 0);
        // Common French translations
        assert.ok(
          result.text.toLowerCase().includes("bonjour") ||
            result.text.toLowerCase().includes("salut") ||
            result.text.toLowerCase().includes("monde"),
          `Expected French translation, got: ${result.text}`,
        );
      });

      it("translates title when provided", async () => {
        const model = await getModel();
        const result = await translate(model, "ko", "This is the content.", {
          title: "My Article",
        });

        assert.ok(result.title != null);
        assert.ok(result.title.length > 0);
      });

      it("respects abort signal", async () => {
        const model = await getModel();
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(
          async () => {
            await translate(model, "ko", "Hello, world!", {
              signal: controller.signal,
            });
          },
          (error: Error) => {
            return error.name === "AbortError" ||
              error.message.includes("abort");
          },
        );
      });

      it("reports chunking progress for long texts", async () => {
        const model = await getModel();
        // Create text that will be split into ~4 chunks (enough to test, not too slow)
        const longText = "This is a paragraph of text. ".repeat(50);
        const progressCalls: Array<{
          stage: string;
          chunkIndex?: number;
          totalChunks?: number;
        }> = [];

        await translate(model, "ko", longText, {
          contextWindow: { type: "explicit", maxTokens: 100 },
          onProgress: (progress) => {
            progressCalls.push({
              stage: progress.stage,
              chunkIndex: progress.stage === "translating"
                ? progress.chunkIndex
                : undefined,
              totalChunks: progress.stage === "translating"
                ? progress.totalChunks
                : undefined,
            });
          },
        });

        // Should have chunking stage
        const chunkingCalls = progressCalls.filter((p) =>
          p.stage === "chunking"
        );
        assert.ok(chunkingCalls.length >= 1);

        // Should have translating stage with chunk info
        const translatingCalls = progressCalls.filter((p) =>
          p.stage === "translating"
        );
        assert.ok(translatingCalls.length >= 2);

        // Check that chunk info is present
        const withChunkInfo = translatingCalls.filter((p) =>
          p.totalChunks != null && p.totalChunks > 1
        );
        assert.ok(
          withChunkInfo.length > 0,
          "Should have chunk info for long texts",
        );
      });

      it("disables chunking when chunker is null", async () => {
        const model = await getModel();
        const progressCalls: string[] = [];

        await translate(model, "ko", "Hello, world!", {
          chunker: null,
          onProgress: (progress) => {
            progressCalls.push(progress.stage);
          },
        });

        // Should not have chunking stage
        assert.ok(!progressCalls.includes("chunking"));
        assert.ok(progressCalls.includes("translating"));
      });

      it("gathers context from required context sources", async () => {
        const model = await getModel();
        let gatherCalled = false;

        const result = await translate(model, "ko", "The author wrote this.", {
          chunker: null,
          contextSources: [
            {
              name: "author-bio",
              description: "Provides author biography",
              mode: "required",
              gather() {
                gatherCalled = true;
                return Promise.resolve({
                  content: "The author is a famous Korean novelist.",
                });
              },
            },
          ],
        });

        assert.ok(gatherCalled, "Context source should be called");
        assert.ok(result.text.length > 0);
      });

      it("reports gatheringContext progress", async () => {
        const model = await getModel();
        const progressCalls: string[] = [];

        await translate(model, "ko", "Hello", {
          chunker: null,
          contextSources: [
            {
              name: "test-source",
              description: "Test source",
              mode: "required",
              gather() {
                return Promise.resolve({ content: "Test context" });
              },
            },
          ],
          onProgress: (progress) => {
            progressCalls.push(progress.stage);
          },
        });

        assert.ok(
          progressCalls.includes("gatheringContext"),
          "Should report gatheringContext stage",
        );
      });

      it("combines context from multiple sources", async () => {
        const model = await getModel();
        const gatheredSources: string[] = [];

        await translate(model, "ko", "Hello", {
          chunker: null,
          contextSources: [
            {
              name: "source-1",
              description: "First source",
              mode: "required",
              gather() {
                gatheredSources.push("source-1");
                return Promise.resolve({ content: "Context from source 1" });
              },
            },
            {
              name: "source-2",
              description: "Second source",
              mode: "required",
              gather() {
                gatheredSources.push("source-2");
                return Promise.resolve({ content: "Context from source 2" });
              },
            },
          ],
        });

        assert.deepEqual(gatheredSources, ["source-1", "source-2"]);
      });

      it("skips passive context sources during required gathering", async () => {
        const model = await getModel();
        let requiredCalled = false;
        let passiveCalled = false;

        // Use Valibot for a real StandardSchema implementation
        const { object, string } = await import("valibot");
        const paramsSchema = object({ query: string() });

        await translate(model, "ko", "Hello", {
          chunker: null,
          contextSources: [
            {
              name: "required-source",
              description: "Required source",
              mode: "required",
              gather() {
                requiredCalled = true;
                return Promise.resolve({ content: "Required context" });
              },
            },
            {
              name: "passive-source",
              description: "Passive source",
              mode: "passive",
              parameters: paramsSchema,
              gather() {
                passiveCalled = true;
                return Promise.resolve({ content: "Should not be called" });
              },
            },
          ],
        });

        // Required source should be called, passive should not
        assert.ok(requiredCalled, "Required source should be called");
        assert.ok(!passiveCalled, "Passive source should not be called");
      });

      it("invokes passive context source as tool when LLM requests it", async () => {
        const model = await getModel();

        // Use Valibot schema for testing (it implements StandardSchema)
        const { object, string, pipe, minLength } = await import("valibot");
        const paramsSchema = object({
          authorName: pipe(string(), minLength(1)),
        });

        const result = await translate(
          model,
          "ko",
          "The author wrote a famous novel about Korean history.",
          {
            chunker: null,
            contextSources: [
              {
                name: "author-lookup",
                description:
                  "Look up information about an author by their name. " +
                  "Use this when you need background information about " +
                  "the author to provide better translation context.",
                mode: "passive",
                parameters: paramsSchema,
                gather(params: { authorName: string }) {
                  return Promise.resolve({
                    content:
                      `${params.authorName} is a renowned Korean novelist ` +
                      "known for historical fiction.",
                  });
                },
              },
            ],
          },
        );

        // The LLM should have called the tool at some point
        assert.ok(result.text.length > 0);
        // Note: Whether the tool is called depends on the LLM's decision
        // This test verifies the infrastructure works when called
      });

      it("reports prompting progress stage for passive sources", async () => {
        const model = await getModel();
        const progressStages: string[] = [];

        const { object, string } = await import("valibot");
        const paramsSchema = object({ query: string() });

        await translate(model, "ko", "Hello world", {
          chunker: null,
          contextSources: [
            {
              name: "lookup",
              description: "Look up additional context",
              mode: "passive",
              parameters: paramsSchema,
              gather() {
                return Promise.resolve({ content: "Some context" });
              },
            },
          ],
          onProgress: (progress) => {
            if (!progressStages.includes(progress.stage)) {
              progressStages.push(progress.stage);
            }
          },
        });

        // Should have prompting stage when passive sources are present
        assert.ok(
          progressStages.includes("prompting"),
          `Expected prompting stage, got: ${progressStages.join(", ")}`,
        );
      });
    },
  );
}
