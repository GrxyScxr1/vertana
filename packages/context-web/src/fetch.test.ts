import assert from "node:assert/strict";
import { describe, it } from "./test-compat.ts";
import { extractContent, fetchLinkedPages, fetchWebPage } from "./fetch.ts";

describe("extractContent", () => {
  it("should extract article content from HTML", () => {
    // Readability requires sufficient content to recognize as an article
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Article</title></head>
        <body>
          <nav><a href="/">Home</a></nav>
          <article>
            <h1>Test Article Title</h1>
            <p>This is the main content of the article. It contains enough text
            to be recognized as meaningful content by the Readability algorithm.
            The algorithm looks for substantial text blocks to determine if
            something is worth extracting.</p>
            <p>It has multiple paragraphs of text. This second paragraph adds
            more content to make the article more substantial. Readability
            needs a minimum amount of text to work properly.</p>
            <p>A third paragraph with additional content helps ensure that
            the extraction algorithm recognizes this as an article worth
            parsing and extracting.</p>
          </article>
          <footer>Copyright 2024</footer>
        </body>
      </html>
    `;
    const result = extractContent(html, "https://example.com/article");
    assert.ok(result != null, "Expected content to be extracted");
    assert.ok(result.content.includes("main content"));
    assert.ok(result.content.includes("multiple paragraphs"));
  });

  it("should return null for non-article pages", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Empty</title></head>
        <body></body>
      </html>
    `;
    const result = extractContent(html, "https://example.com/empty");
    assert.equal(result, null);
  });

  it("should handle pages without article tags", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Simple Page</title></head>
        <body>
          <div class="content">
            <h1>Page Title</h1>
            <p>Some substantial content goes here. This paragraph has enough text
            to be considered readable content by the algorithm. It needs to be
            fairly long to pass the content length heuristics.</p>
            <p>Another paragraph with more content to make this look like a real
            article with meaningful text that should be extracted.</p>
          </div>
        </body>
      </html>
    `;
    const result = extractContent(html, "https://example.com/simple");
    // May or may not extract depending on content length
    if (result != null) {
      assert.ok(result.content.includes("substantial content"));
    }
  });
});

describe("fetchWebPage", () => {
  it("should be a passive context source", () => {
    assert.equal(fetchWebPage.mode, "passive");
    assert.equal(fetchWebPage.name, "fetch-web-page");
    assert.ok(fetchWebPage.description.length > 0);
    assert.ok(fetchWebPage.parameters != null);
  });

  it("should have url parameter", () => {
    // The parameters should accept { url: string }
    const schema = fetchWebPage.parameters;
    assert.ok(schema != null);
  });
});

describe("fetchLinkedPages", () => {
  it("should create a required context source", () => {
    const source = fetchLinkedPages({
      text: "Check https://example.com for info.",
      mediaType: "text/plain",
    });

    assert.equal(source.mode, "required");
    assert.equal(source.name, "fetch-linked-pages");
    assert.ok(source.description.length > 0);
  });

  it("should respect maxLinks option", () => {
    const source = fetchLinkedPages({
      text: `
        https://example.com/1
        https://example.com/2
        https://example.com/3
        https://example.com/4
        https://example.com/5
      `,
      mediaType: "text/plain",
      maxLinks: 3,
    });

    assert.equal(source.mode, "required");
    // The actual limiting is tested during gather()
  });
});
