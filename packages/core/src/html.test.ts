import { describe, it } from "./test-compat.ts";
import assert from "node:assert/strict";
import { createHtmlChunker } from "./html.ts";

describe("createHtmlChunker", () => {
  const chunker = createHtmlChunker();

  it("returns an empty array for empty input", async () => {
    const chunks = await chunker("");
    assert.deepEqual(chunks, []);
  });

  it("returns an empty array for whitespace-only input", async () => {
    const chunks = await chunker("   \n\t  ");
    assert.deepEqual(chunks, []);
  });

  it("creates a single chunk for a simple paragraph", async () => {
    const chunks = await chunker("<p>Hello, world!</p>");
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].content.includes("Hello, world!"));
    assert.equal(chunks[0].type, "paragraph");
    assert.equal(chunks[0].index, 0);
  });

  it("identifies heading elements (h1-h6)", async () => {
    const chunks = await chunker("<h1>Title</h1><h2>Subtitle</h2>");
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].type, "heading");
    assert.equal(chunks[1].type, "heading");
  });

  it("identifies list elements (ul)", async () => {
    const chunks = await chunker("<ul><li>Item 1</li><li>Item 2</li></ul>");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "list");
  });

  it("identifies list elements (ol)", async () => {
    const chunks = await chunker("<ol><li>First</li><li>Second</li></ol>");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "list");
  });

  it("identifies code blocks (pre)", async () => {
    const chunks = await chunker("<pre><code>const x = 1;</code></pre>");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "code");
  });

  it("identifies section elements", async () => {
    const chunks = await chunker("<article><p>Content here</p></article>");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].type, "section");
  });

  it("excludes script elements from translation", async () => {
    const html = "<p>Text</p><script>alert('hi');</script><p>More</p>";
    const chunks = await chunker(html);
    assert.equal(chunks.length, 2);
    assert.ok(!chunks.some((c) => c.content.includes("alert")));
  });

  it("excludes style elements from translation", async () => {
    const html = "<style>.foo { color: red; }</style><p>Text</p>";
    const chunks = await chunker(html);
    assert.equal(chunks.length, 1);
    assert.ok(!chunks[0].content.includes(".foo"));
  });

  it("excludes svg elements from translation", async () => {
    const html = '<p>Before</p><svg><circle r="10"/></svg><p>After</p>';
    const chunks = await chunker(html);
    assert.equal(chunks.length, 2);
    assert.ok(!chunks.some((c) => c.content.includes("circle")));
  });

  it("handles nested div structures", async () => {
    const html =
      "<div class='outer'><div class='inner'><p>Content</p></div></div>";
    const chunks = await chunker(html);
    assert.ok(chunks.length >= 1);
    assert.ok(chunks.some((c) => c.content.includes("Content")));
  });

  it("preserves HTML attributes", async () => {
    const html = '<a href="https://example.com" title="Example">Link</a>';
    const wrapped = `<p>${html}</p>`;
    const chunks = await chunker(wrapped);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].content.includes('href="https://example.com"'));
    assert.ok(chunks[0].content.includes('title="Example"'));
  });

  it("preserves image alt attributes", async () => {
    const html = '<p><img src="test.jpg" alt="A test image"></p>';
    const chunks = await chunker(html);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].content.includes('alt="A test image"'));
  });

  it("creates multiple chunks for multiple paragraphs", async () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    const chunks = await chunker(html);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].index, 0);
    assert.equal(chunks[1].index, 1);
  });

  it("splits large content into multiple chunks", async () => {
    const sentence = "This is a long sentence that repeats. ";
    const paragraph = `<p>${sentence.repeat(50)}</p>`;
    const chunks = await chunker(paragraph, { maxTokens: 50 });
    assert.ok(chunks.length > 1);
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => chunker("<p>Hello</p>", { signal: controller.signal }),
      { name: "AbortError" },
    );
  });

  it("respects custom token counter", async () => {
    // Token counter that counts each character as a token
    const customCounter = (text: string) => text.length;
    const chunks = await chunker("<p>Hello world</p>", {
      maxTokens: 10,
      countTokens: customCounter,
    });
    assert.ok(chunks.length >= 1);
  });

  it("handles malformed HTML gracefully", async () => {
    const html = "<p>Unclosed paragraph<div>Mixed content</p></div>";
    // Should not throw
    const chunks = await chunker(html);
    assert.ok(chunks.length >= 1);
  });

  it("handles self-closing tags", async () => {
    const html = "<p>Text with<br>line break and<hr>horizontal rule</p>";
    const chunks = await chunker(html);
    assert.ok(chunks.length >= 1);
  });

  it("handles tables", async () => {
    const html = `
      <table>
        <tr><th>Header</th></tr>
        <tr><td>Data</td></tr>
      </table>
    `;
    const chunks = await chunker(html);
    assert.ok(chunks.length >= 1);
    assert.ok(chunks.some((c) => c.content.includes("Header")));
  });

  it("skips elements with no translatable content", async () => {
    const html = "<div>   </div><p>Real content</p>";
    const chunks = await chunker(html);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].content.includes("Real content"));
  });

  it("handles mixed block and inline elements", async () => {
    const html = `
      <div>
        <p>Paragraph with <strong>bold</strong> text.</p>
        <ul>
          <li>Item one</li>
          <li>Item two</li>
        </ul>
      </div>
    `;
    const chunks = await chunker(html);
    assert.ok(chunks.length >= 1);
  });

  it("preserves inline formatting within chunks", async () => {
    const html =
      "<p>Text with <em>emphasis</em> and <strong>bold</strong>.</p>";
    const chunks = await chunker(html);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].content.includes("<em>"));
    assert.ok(chunks[0].content.includes("<strong>"));
  });
});
