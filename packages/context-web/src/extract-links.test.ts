import assert from "node:assert/strict";
import { describe, it } from "./test-compat.ts";
import { extractLinks } from "./extract-links.ts";

describe("extractLinks", () => {
  describe("text/plain", () => {
    it("should extract URLs from plain text", () => {
      const text = `
        Check out https://example.com for more info.
        Also see http://another.example.org/page.
      `;
      const links = extractLinks(text, "text/plain");
      assert.deepEqual(links, [
        "https://example.com",
        "http://another.example.org/page",
      ]);
    });

    it("should handle URLs with query strings and fragments", () => {
      const text = "Visit https://example.com/path?foo=bar&baz=qux#section";
      const links = extractLinks(text, "text/plain");
      assert.deepEqual(links, [
        "https://example.com/path?foo=bar&baz=qux#section",
      ]);
    });

    it("should handle URLs at end of sentence", () => {
      const text = "See https://example.com/page.";
      const links = extractLinks(text, "text/plain");
      assert.deepEqual(links, ["https://example.com/page"]);
    });

    it("should handle URLs in parentheses", () => {
      const text = "(see https://example.com for details)";
      const links = extractLinks(text, "text/plain");
      assert.deepEqual(links, ["https://example.com"]);
    });

    it("should return empty array for text without URLs", () => {
      const text = "This is plain text without any links.";
      const links = extractLinks(text, "text/plain");
      assert.deepEqual(links, []);
    });

    it("should deduplicate URLs", () => {
      const text = `
        https://example.com
        https://example.com
        https://other.com
      `;
      const links = extractLinks(text, "text/plain");
      assert.deepEqual(links, ["https://example.com", "https://other.com"]);
    });
  });

  describe("text/markdown", () => {
    it("should extract URLs from markdown links", () => {
      const text = `
        Check out [this article](https://example.com/article).
        Also see [another page](http://another.example.org).
      `;
      const links = extractLinks(text, "text/markdown");
      assert.deepEqual(links, [
        "https://example.com/article",
        "http://another.example.org",
      ]);
    });

    it("should extract URLs from reference-style links", () => {
      const text = `
        See [this article][1] for more.

        [1]: https://example.com/article
      `;
      const links = extractLinks(text, "text/markdown");
      assert.deepEqual(links, ["https://example.com/article"]);
    });

    it("should extract bare URLs in markdown", () => {
      const text = `
        Check https://example.com for info.
        Or <https://another.com/page>.
      `;
      const links = extractLinks(text, "text/markdown");
      assert.deepEqual(links.toSorted(), [
        "https://another.com/page",
        "https://example.com",
      ]);
    });

    it("should extract image URLs", () => {
      const text = "![alt text](https://example.com/image.png)";
      const links = extractLinks(text, "text/markdown");
      assert.deepEqual(links, ["https://example.com/image.png"]);
    });

    it("should not extract code block URLs", () => {
      const text = `
        \`\`\`
        const url = "https://example.com/in-code";
        \`\`\`

        Check [real link](https://example.com/real).
      `;
      const links = extractLinks(text, "text/markdown");
      assert.deepEqual(links, ["https://example.com/real"]);
    });
  });

  describe("text/html", () => {
    it("should extract URLs from anchor tags", () => {
      const html = `
        <p>Check out <a href="https://example.com">this link</a>.</p>
        <a href="http://another.example.org/page">Another</a>
      `;
      const links = extractLinks(html, "text/html");
      assert.deepEqual(links, [
        "https://example.com",
        "http://another.example.org/page",
      ]);
    });

    it("should skip javascript: and mailto: URLs", () => {
      const html = `
        <a href="https://example.com">Valid</a>
        <a href="javascript:void(0)">Skip</a>
        <a href="mailto:test@example.com">Skip</a>
        <a href="tel:+1234567890">Skip</a>
      `;
      const links = extractLinks(html, "text/html");
      assert.deepEqual(links, ["https://example.com"]);
    });

    it("should skip empty href attributes", () => {
      const html = `
        <a href="">Empty</a>
        <a href="#">Hash only</a>
        <a href="https://example.com">Valid</a>
      `;
      const links = extractLinks(html, "text/html");
      assert.deepEqual(links, ["https://example.com"]);
    });

    it("should handle relative URLs by skipping them", () => {
      const html = `
        <a href="/path/to/page">Relative</a>
        <a href="https://example.com/absolute">Absolute</a>
      `;
      const links = extractLinks(html, "text/html");
      assert.deepEqual(links, ["https://example.com/absolute"]);
    });
  });
});
