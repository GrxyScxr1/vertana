import { describe, it } from "./test-compat.ts";
import assert from "node:assert/strict";
import { createPlainTextChunker } from "./plaintext.ts";

describe("createPlainTextChunker", () => {
  const chunker = createPlainTextChunker();

  it("returns an empty array for empty input", async () => {
    const chunks = await chunker("");
    assert.deepEqual(chunks, []);
  });

  it("returns an empty array for whitespace-only input", async () => {
    const chunks = await chunker("   \n\t\n  ");
    assert.deepEqual(chunks, []);
  });

  it("creates a single chunk for single paragraph", async () => {
    const chunks = await chunker("Hello, world!");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].content, "Hello, world!");
    assert.equal(chunks[0].type, "paragraph");
    assert.equal(chunks[0].index, 0);
  });

  it("trims leading and trailing whitespace", async () => {
    const chunks = await chunker("  Line with spaces  ");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].content, "Line with spaces");
  });

  it("splits text by single blank line", async () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].content, "First paragraph.");
    assert.equal(chunks[1].content, "Second paragraph.");
    assert.equal(chunks[0].index, 0);
    assert.equal(chunks[1].index, 1);
  });

  it("splits text by multiple blank lines", async () => {
    const text = "First paragraph.\n\n\n\nSecond paragraph.";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].content, "First paragraph.");
    assert.equal(chunks[1].content, "Second paragraph.");
  });

  it("handles blank lines with whitespace", async () => {
    const text = "First paragraph.\n   \n  \nSecond paragraph.";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 2);
  });

  it("handles three paragraphs", async () => {
    const text = "Para one.\n\nPara two.\n\nPara three.";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].content, "Para one.");
    assert.equal(chunks[1].content, "Para two.");
    assert.equal(chunks[2].content, "Para three.");
  });

  it("preserves line breaks within paragraphs", async () => {
    const text = "Line one\nLine two\nLine three";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].content, "Line one\nLine two\nLine three");
  });

  it("handles multi-line paragraphs separated by blank lines", async () => {
    const text = "Line A1\nLine A2\n\nLine B1\nLine B2";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].content, "Line A1\nLine A2");
    assert.equal(chunks[1].content, "Line B1\nLine B2");
  });

  it("splits large paragraph by sentences when exceeding maxTokens", async () => {
    const text = "First sentence. Second sentence. Third sentence.";
    // Custom counter: each word is 10 tokens
    const customCounter = (t: string) => t.split(/\s+/).length * 10;
    const chunks = await chunker(text, {
      maxTokens: 25, // ~2.5 words
      countTokens: customCounter,
    });
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.equal(chunk.type, "paragraph");
    }
  });

  it("respects custom token counter", async () => {
    const text = "Hello world. This is a test.";
    // Custom counter: each word is 5 tokens
    const customCounter = (t: string) => t.split(/\s+/).length * 5;
    const chunks = await chunker(text, {
      maxTokens: 15, // ~3 words
      countTokens: customCounter,
    });
    assert.ok(chunks.length > 1);
  });

  it("handles single very long sentence gracefully", async () => {
    // Single sentence that cannot be split further
    const text = "This is a very long sentence that cannot be split.";
    const chunks = await chunker(text, { maxTokens: 5 });
    // Should return at least the content even if over limit
    assert.ok(chunks.length >= 1);
    assert.ok(chunks.some((c) => c.content.includes("very long")));
  });

  it("always sets chunk type to paragraph", async () => {
    const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
    const chunks = await chunker(text);
    for (const chunk of chunks) {
      assert.equal(chunk.type, "paragraph");
    }
  });

  it("assigns sequential indices to chunks", async () => {
    const text = "A.\n\nB.\n\nC.\n\nD.";
    const chunks = await chunker(text);
    for (let i = 0; i < chunks.length; i++) {
      assert.equal(chunks[i].index, i);
    }
  });

  it("maintains indices when splitting by sentences", async () => {
    const text = "Sentence one. Sentence two. Sentence three.";
    const chunks = await chunker(text, { maxTokens: 10 });
    for (let i = 0; i < chunks.length; i++) {
      assert.equal(chunks[i].index, i);
    }
  });

  it("respects abort signal - already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => chunker("Hello", { signal: controller.signal }),
      { name: "AbortError" },
    );
  });

  it("handles Windows line endings (CRLF)", async () => {
    const text = "Para one.\r\n\r\nPara two.";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 2);
  });

  it("handles mixed line endings", async () => {
    const text = "Para one.\n\nPara two.\r\n\r\nPara three.";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 3);
  });

  it("handles text with leading/trailing blank lines", async () => {
    const text = "\n\nActual content.\n\n";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].content, "Actual content.");
  });

  it("does not detect Markdown headings as special", async () => {
    const text = "# Heading\n\nParagraph.";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].content, "# Heading");
    assert.equal(chunks[0].type, "paragraph");
    assert.equal(chunks[1].content, "Paragraph.");
    assert.equal(chunks[1].type, "paragraph");
  });

  it("does not detect Markdown code blocks as special", async () => {
    const text = "```\ncode\n```";
    const chunks = await chunker(text);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "paragraph");
    assert.ok(chunks[0].content.includes("code"));
  });
});
