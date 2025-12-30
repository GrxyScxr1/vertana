import assert from "node:assert/strict";
import { describe, it } from "./test-compat.ts";
import { searchWeb } from "./index.ts";

const SAMPLE_HTML = `
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
  <head>
    <meta http-equiv="content-type" content="text/html; charset=UTF-8">
    <title>openai at DuckDuckGo</title>
  </head>
  <body>
    <table border="0">
      <tr>
        <td valign="top">1.&nbsp;</td>
        <td>
          <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fopenai.com%2F" class='result-link'>OpenAI</a>
        </td>
      </tr>
      <tr>
        <td>&nbsp;&nbsp;&nbsp;</td>
        <td class='result-snippet'>We build safe AGI.</td>
      </tr>
      <tr>
        <td>&nbsp;&nbsp;&nbsp;</td>
        <td>
          <span class='link-text'>openai.com</span>
        </td>
      </tr>

      <tr>
        <td valign="top">2.&nbsp;</td>
        <td>
          <a rel="nofollow" href="https://example.com/direct" class='result-link'>Direct URL</a>
        </td>
      </tr>
      <!-- snippet row missing intentionally -->
      <tr>
        <td>&nbsp;&nbsp;&nbsp;</td>
        <td>
          <span class='link-text'>example.com/direct</span>
        </td>
      </tr>

      <tr>
        <td valign="top">3.&nbsp;</td>
        <td>
          <a rel="nofollow" href="//duckduckgo.com/l/?uddg=%ZZ" class='result-link'>Bad redirect</a>
        </td>
      </tr>
      <tr>
        <td>&nbsp;&nbsp;&nbsp;</td>
        <td class='result-snippet'>Snippet exists.</td>
      </tr>
    </table>
  </body>
</html>
`;

const ROBUSTNESS_HTML = `
<html>
  <body>
    <table>
      <tr>
        <td>Header row</td>
      </tr>

      <tr>
        <td>
          <a class="result-link extra" href="https://a.example/">A</a>
        </td>
      </tr>
      <tr>
        <td>
          <span class="link-text">a.example</span>
        </td>
      </tr>
      <!-- A has no snippet; ensure we don't steal B's snippet -->

      <tr>
        <td>
          <a class="result-link" href="https://b.example/">B</a>
        </td>
      </tr>
      <tr>
        <td class="result-snippet">
          <span>Snippet</span> <b>B</b>
        </td>
      </tr>
      <tr>
        <td>
          <span class="link-text">b.example</span>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

describe("searchWeb", () => {
  it("should be a passive context source", () => {
    assert.equal(searchWeb.mode, "passive");
    assert.equal(searchWeb.name, "search-web");
    assert.ok(searchWeb.description.length > 0);
    assert.ok(searchWeb.parameters != null);
  });

  it("should format search results from fetched HTML", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = () => {
      return Promise.resolve(
        new Response(SAMPLE_HTML, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    };

    try {
      const result = await searchWeb.gather({
        query: "openai",
        maxResults: 2,
        region: "kr-kr",
        timeRange: "w",
      });

      assert.ok(result.content.includes("# Web search results: openai"));
      assert.ok(result.content.includes("## 1. OpenAI"));
      assert.ok(result.content.includes("URL: https://openai.com/"));
      assert.ok(result.content.includes("## 2. Direct URL"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle non-OK response", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = () => {
      return Promise.resolve(new Response("oops", { status: 503 }));
    };

    try {
      const result = await searchWeb.gather({ query: "openai" });
      assert.ok(result.content.includes("Failed to search the web"));
      assert.deepEqual(result.metadata, {
        query: "openai",
        success: false,
        status: 503,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should ignore unrelated rows and avoid snippet misassociation", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = () => {
      return Promise.resolve(
        new Response(ROBUSTNESS_HTML, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    };

    try {
      const result = await searchWeb.gather({ query: "robustness" });

      assert.ok(result.content.includes("## 1. A"));
      assert.ok(result.content.includes("URL: https://a.example/"));

      // A has no snippet; ensure B's snippet isn't attached.
      const aSectionStart = result.content.indexOf("## 1. A");
      const bSectionStart = result.content.indexOf("## 2. B");
      assert.ok(aSectionStart !== -1);
      assert.ok(bSectionStart !== -1);
      const aSection = result.content.slice(aSectionStart, bSectionStart);
      assert.ok(!aSection.includes("Snippet B"));

      // B includes nested text content; ensure it is captured.
      assert.ok(result.content.includes("## 2. B"));
      assert.ok(result.content.includes("URL: https://b.example/"));
      assert.ok(result.content.includes("Snippet B"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should respect abort signal", async () => {
    const originalFetch = globalThis.fetch;

    const controller = new AbortController();
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";

    let observedSignal: AbortSignal | null | undefined;

    globalThis.fetch = (_url, init) => {
      observedSignal = init?.signal;
      return Promise.reject(abortError);
    };

    try {
      const result = await searchWeb.gather(
        { query: "openai" },
        { signal: controller.signal },
      );

      assert.equal(observedSignal, controller.signal);
      assert.equal(result.content, "Search aborted.");
      assert.deepEqual(result.metadata, {
        query: "openai",
        success: false,
        aborted: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
