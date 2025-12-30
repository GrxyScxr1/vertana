import { getLogger } from "@logtape/logtape";
import type {
  ContextSourceGatherOptions,
  PassiveContextSource,
} from "@vertana/core/context";
import { parseDocument } from "htmlparser2";
import type { ChildNode, Document, Element } from "domhandler";
import { z } from "zod";

const logger = getLogger(["vertana", "context-web", "search"]);

interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
  readonly displayUrl?: string;
}

interface ParseDuckDuckGoLiteResultsOptions {
  readonly maxResults?: number;
}

function unwrapDuckDuckGoRedirectUrl(href: string): string | null {
  const trimmed = href.trim();

  const normalized = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const isDuckDuckGo = /(^|\.)duckduckgo\.com$/i.test(parsed.hostname);
  if (!isDuckDuckGo) {
    return trimmed;
  }

  if (parsed.pathname !== "/l/") {
    return trimmed;
  }

  const raw = parsed.searchParams.get("uddg");
  if (raw == null || raw.length === 0) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(raw);
    new URL(decoded);
    return decoded;
  } catch {
    return null;
  }
}

function isElement(node: ChildNode): node is Element {
  return node.type === "tag";
}

function getTextContent(node: ChildNode): string {
  if (node.type === "text") {
    return node.data;
  }

  if (isElement(node)) {
    return node.children.map(getTextContent).join("");
  }

  return "";
}

function hasClass(element: Element, className: string): boolean {
  const classes = element.attribs.class;
  if (classes == null) {
    return false;
  }
  return classes.split(/\s+/).includes(className);
}

function collectElementsByTagName(doc: Document, tagName: string): Element[] {
  const results: Element[] = [];

  function visit(node: ChildNode): void {
    if (isElement(node)) {
      if (node.name === tagName) {
        results.push(node);
      }
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  for (const child of doc.children) {
    visit(child);
  }

  return results;
}

function findFirstAnchorWithClass(
  node: ChildNode,
  className: string,
): Element | null {
  if (isElement(node) && node.name === "a" && hasClass(node, className)) {
    return node;
  }

  if (isElement(node)) {
    for (const child of node.children) {
      const found = findFirstAnchorWithClass(child, className);
      if (found != null) {
        return found;
      }
    }
  }

  return null;
}

function findFirstTextByClass(
  node: ChildNode,
  className: string,
): string | null {
  if (isElement(node) && hasClass(node, className)) {
    const text = getTextContent(node).trim();
    return text.length > 0 ? text : null;
  }

  if (isElement(node)) {
    for (const child of node.children) {
      const found = findFirstTextByClass(child, className);
      if (found != null) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Parses DuckDuckGo Lite search result HTML.
 *
 * This parser intentionally relies on minimal semantics:
 * - Each result starts at a `<tr>` that contains an `a.result-link`.
 * - Additional data (snippet, display URL) is searched within subsequent `<tr>`
 *   siblings until the next result starts.
 *
 * This keeps the parser resistant to minor structure changes while avoiding
 * accidentally attaching a snippet from the next result.
 *
 * @param html DuckDuckGo Lite HTML.
 * @param options Parsing options.
 * @returns Parsed search results.
 * @since 0.1.0
 */
function parseDuckDuckGoLiteResults(
  html: string,
  options: ParseDuckDuckGoLiteResultsOptions = {},
): readonly WebSearchResult[] {
  const maxResults = options.maxResults ?? 10;
  if (maxResults <= 0) {
    return [];
  }

  const doc = parseDocument(html, {
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
  });

  const rows = collectElementsByTagName(doc, "tr");

  const results: WebSearchResult[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const anchor = findFirstAnchorWithClass(row, "result-link");
    if (anchor == null) {
      continue;
    }

    const title = getTextContent(anchor).trim();
    const href = anchor.attribs.href?.trim();
    if (title.length === 0 || href == null || href.length === 0) {
      continue;
    }

    const unwrapped = unwrapDuckDuckGoRedirectUrl(href);
    const url = unwrapped ?? href;

    let snippet: string | null = null;
    let displayUrl: string | null = null;

    for (let j = rowIndex; j < rows.length; j++) {
      if (
        j !== rowIndex &&
        findFirstAnchorWithClass(rows[j], "result-link") != null
      ) {
        // Next result starts.
        break;
      }

      snippet ??= findFirstTextByClass(rows[j], "result-snippet");
      displayUrl ??= findFirstTextByClass(rows[j], "link-text");

      if (snippet != null && displayUrl != null) {
        break;
      }
    }

    results.push({
      title,
      url,
      snippet: snippet ?? undefined,
      displayUrl: displayUrl ?? undefined,
    });

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

interface SearchWebParams {
  readonly query: string;
  readonly maxResults?: number;
  readonly region?: string;
  readonly timeRange?: "d" | "w" | "m" | "y";
}

/**
 * A passive context source that performs a web search using DuckDuckGo Lite.
 *
 * This source returns a list of search results (title, URL, snippet) and does
 * not fetch the target pages themselves. Combine with {@link fetchWebPage} if
 * you want to retrieve a specific result in detail.
 *
 * @since 0.1.0
 */
export const searchWeb: PassiveContextSource<SearchWebParams> = {
  name: "search-web",
  description:
    "Searches the web (DuckDuckGo Lite) and returns a list of results " +
    "with titles, URLs, and snippets. Use this to quickly find relevant pages, " +
    "then fetch a specific page separately if needed.",
  mode: "passive",
  parameters: z.object({
    query: z.string().min(1).describe("The search query keyword(s)"),
    maxResults: z.number().int().positive().max(50).optional().describe(
      "Maximum number of results to return (default: 10)",
    ),
    region: z.string().optional().describe(
      "DuckDuckGo region (kl) parameter, e.g. 'kr-kr' or 'us-en'",
    ),
    timeRange: z.enum(["d", "w", "m", "y"]).optional().describe(
      "Time range filter (df): d=day, w=week, m=month, y=year",
    ),
  }),

  async gather(params: SearchWebParams, options?: ContextSourceGatherOptions) {
    const maxResults = params.maxResults ?? 10;

    const url = new URL("https://lite.duckduckgo.com/lite/");
    url.searchParams.set("q", params.query);
    if (params.region != null && params.region.trim().length > 0) {
      url.searchParams.set("kl", params.region.trim());
    }
    if (params.timeRange != null) {
      url.searchParams.set("df", params.timeRange);
    }

    logger.debug("Searching DuckDuckGo Lite: {url}", { url: url.toString() });

    try {
      const response = await fetch(url, {
        signal: options?.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Vertana/0.1; +https://vertana.org)",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        return {
          content: `Failed to search the web. Status: ${response.status}`,
          metadata: {
            query: params.query,
            success: false,
            status: response.status,
          },
        };
      }

      const html = await response.text();
      const results = parseDuckDuckGoLiteResults(html, { maxResults });

      const content = formatSearchResults(params.query, results);
      return {
        content,
        metadata: {
          query: params.query,
          resultCount: results.length,
          urls: results.map((r) => r.url),
          success: true,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          content: "Search aborted.",
          metadata: { query: params.query, success: false, aborted: true },
        };
      }

      return {
        content: `Failed to search the web. Error: ${String(error)}`,
        metadata: { query: params.query, success: false },
      };
    }
  },
};

function formatSearchResults(
  query: string,
  results: readonly WebSearchResult[],
): string {
  if (results.length === 0) {
    return `No web search results found for: ${query}`;
  }

  const lines: string[] = [];
  lines.push(`# Web search results: ${query}`);
  lines.push("");

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    lines.push(`## ${i + 1}. ${result.title}`);
    lines.push(`URL: ${result.url}`);
    if (result.displayUrl != null) {
      lines.push(`Display: ${result.displayUrl}`);
    }
    if (result.snippet != null) {
      lines.push("");
      lines.push(result.snippet);
    }
    if (i !== results.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}
