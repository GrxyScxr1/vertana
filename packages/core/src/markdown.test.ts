import { describe, it } from "./test-compat.ts";
import assert from "node:assert/strict";
import { createMarkdownChunker } from "./markdown.ts";

describe("createMarkdownChunker", () => {
  const chunker = createMarkdownChunker();

  it("returns an empty array for empty input", async () => {
    const chunks = await chunker("");
    assert.deepEqual(chunks, []);
  });

  it("creates a single chunk for small content", async () => {
    const chunks = await chunker("Hello, world!");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].content, "Hello, world!");
    assert.equal(chunks[0].type, "paragraph");
    assert.equal(chunks[0].index, 0);
  });

  it("identifies ATX-style headings", async () => {
    const chunks = await chunker("# Heading 1\n\nSome paragraph.");
    assert.equal(chunks.length, 1);
    // Heading and paragraph are combined in a single chunk
    assert.ok(chunks[0].content.includes("# Heading 1"));
    assert.ok(chunks[0].content.includes("Some paragraph"));
  });

  it("identifies Setext-style headings", async () => {
    const chunks = await chunker("Heading\n=======\n\nParagraph.");
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].content.includes("Heading"));
  });

  it("identifies code blocks", async () => {
    const markdown =
      "Some text.\n\n```javascript\nconst x = 1;\n```\n\nMore text.";
    const chunks = await chunker(markdown);
    assert.ok(chunks.length >= 1);
    // Check that code block is identified
    const hasCode = chunks.some((c) => c.type === "code");
    assert.ok(hasCode || chunks.some((c) => c.content.includes("const x = 1")));
  });

  it("identifies unordered lists", async () => {
    const markdown = "- Item 1\n- Item 2\n- Item 3";
    const chunks = await chunker(markdown);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "list");
    assert.ok(chunks[0].content.includes("Item 1"));
  });

  it("identifies ordered lists", async () => {
    const markdown = "1. First\n2. Second\n3. Third";
    const chunks = await chunker(markdown);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "list");
  });

  it("identifies lists with continuation lines", async () => {
    // List items with multi-line content (continuation lines are indented)
    const markdown = `- Item 1: This is a description
  that continues on the next line
- Item 2: Another item
  with continuation`;
    const chunks = await chunker(markdown);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "list");
  });

  it("identifies project-style lists with leading spaces", async () => {
    // Project style: space-hyphen-two spaces with 4-space indented continuation
    const markdown = ` -  First item with description
    that continues on the next line
 -  Second item with description
    also with continuation`;
    const chunks = await chunker(markdown);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "list");
  });

  it("identifies split list chunks as list type", async () => {
    // When a long list is split, each chunk should be identified as "list"
    const items = Array.from(
      { length: 20 },
      (_, i) => ` -  Item ${i + 1}: Description\n    with continuation`,
    ).join("\n");
    const chunks = await chunker(items, { maxTokens: 100 });
    assert.ok(chunks.length > 1, "Should split into multiple chunks");
    for (const chunk of chunks) {
      assert.equal(
        chunk.type,
        "list",
        `Chunk ${chunk.index} should be type "list", got "${chunk.type}"`,
      );
    }
  });

  it("splits large content into multiple chunks", async () => {
    // Create content that will exceed the token limit
    const paragraph = "This is a sentence. ".repeat(100);
    const chunks = await chunker(paragraph, { maxTokens: 50 });
    assert.ok(chunks.length > 1);
  });

  it("respects custom token counter", async () => {
    const markdown = "Hello world. This is a test.";
    // Custom counter that always returns a fixed value
    const customCounter = (_text: string) => 10;
    const chunks = await chunker(markdown, {
      maxTokens: 100,
      countTokens: customCounter,
    });
    assert.ok(chunks.length >= 1);
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => chunker("Hello", { signal: controller.signal }),
      { name: "AbortError" },
    );
  });

  it("handles multiple paragraphs", async () => {
    const markdown =
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    const chunks = await chunker(markdown);
    assert.ok(chunks.length >= 1);
    assert.ok(chunks[0].content.includes("First paragraph"));
  });

  it("handles mixed content types", async () => {
    const markdown = `# Title

This is a paragraph.

- List item 1
- List item 2

\`\`\`python
print("hello")
\`\`\`

Another paragraph.`;
    const chunks = await chunker(markdown);
    assert.ok(chunks.length >= 1);
    // Content should be present somewhere in chunks
    const allContent = chunks.map((c) => c.content).join(" ");
    assert.ok(allContent.includes("Title"));
    assert.ok(allContent.includes("paragraph"));
    assert.ok(allContent.includes("List item"));
    assert.ok(allContent.includes("print"));
  });

  it("preserves chunk indices", async () => {
    const markdown = "Para 1.\n\nPara 2.\n\nPara 3.";
    const chunks = await chunker(markdown, { maxTokens: 10 });
    for (let i = 0; i < chunks.length; i++) {
      assert.equal(chunks[i].index, i);
    }
  });

  it("handles code blocks with language specifier", async () => {
    const markdown = "```typescript\nconst x: number = 1;\n```";
    const chunks = await chunker(markdown);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "code");
    assert.ok(chunks[0].content.includes("typescript"));
  });

  it("handles tilde code fences", async () => {
    const markdown = "~~~\ncode here\n~~~";
    const chunks = await chunker(markdown);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "code");
  });

  it("handles nested code fences", async () => {
    const markdown = "````\n```\nnested\n```\n````";
    const chunks = await chunker(markdown);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "code");
  });
});
