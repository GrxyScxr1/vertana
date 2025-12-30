import { parseDocument } from "htmlparser2";
import type { ChildNode, Element } from "domhandler";

/**
 * Supported media types for link extraction.
 *
 * @since 0.1.0
 */
export type MediaType = "text/plain" | "text/markdown" | "text/html";

/**
 * Extracts URLs from text based on the media type.
 *
 * @param text The text to extract URLs from.
 * @param mediaType The media type of the text.
 * @returns An array of unique URLs found in the text.
 * @since 0.1.0
 */
export function extractLinks(
  text: string,
  mediaType: MediaType,
): readonly string[] {
  switch (mediaType) {
    case "text/plain":
      return extractFromPlainText(text);
    case "text/markdown":
      return extractFromMarkdown(text);
    case "text/html":
      return extractFromHtml(text);
  }
}

/**
 * URL pattern for plain text extraction.
 * Matches http:// and https:// URLs.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * Characters that should be trimmed from the end of URLs.
 */
const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

/**
 * Extracts URLs from plain text.
 */
function extractFromPlainText(text: string): readonly string[] {
  const matches = text.match(URL_PATTERN);
  if (matches == null) {
    return [];
  }

  const urls = new Set<string>();
  for (const match of matches) {
    // Remove trailing punctuation that might be part of the sentence
    const cleanUrl = match.replace(TRAILING_PUNCTUATION, "");
    if (isValidUrl(cleanUrl)) {
      urls.add(cleanUrl);
    }
  }

  return [...urls];
}

/**
 * Markdown link patterns.
 */
const MARKDOWN_INLINE_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
const MARKDOWN_REFERENCE_LINK = /^\[([^\]]+)\]:\s*(\S+)/gm;
const MARKDOWN_AUTOLINK = /<(https?:\/\/[^>]+)>/g;
const MARKDOWN_CODE_BLOCK = /```[\s\S]*?```|`[^`]+`/g;

/**
 * Extracts URLs from Markdown text.
 */
function extractFromMarkdown(text: string): readonly string[] {
  // Remove code blocks to avoid extracting URLs from code
  const textWithoutCode = text.replace(MARKDOWN_CODE_BLOCK, "");

  const urls = new Set<string>();

  // Extract inline links [text](url)
  let match: RegExpExecArray | null;
  MARKDOWN_INLINE_LINK.lastIndex = 0;
  while ((match = MARKDOWN_INLINE_LINK.exec(textWithoutCode)) != null) {
    const url = match[2];
    if (isValidUrl(url)) {
      urls.add(url);
    }
  }

  // Extract reference-style links [ref]: url
  MARKDOWN_REFERENCE_LINK.lastIndex = 0;
  while ((match = MARKDOWN_REFERENCE_LINK.exec(textWithoutCode)) != null) {
    const url = match[2];
    if (isValidUrl(url)) {
      urls.add(url);
    }
  }

  // Extract autolinks <https://...>
  MARKDOWN_AUTOLINK.lastIndex = 0;
  while ((match = MARKDOWN_AUTOLINK.exec(textWithoutCode)) != null) {
    const url = match[1];
    if (isValidUrl(url)) {
      urls.add(url);
    }
  }

  // Extract bare URLs (not already matched)
  const bareUrls = extractFromPlainText(textWithoutCode);
  for (const url of bareUrls) {
    urls.add(url);
  }

  return [...urls];
}

/**
 * Determines if a node is an element.
 */
function isElement(node: ChildNode): node is Element {
  return node.type === "tag";
}

/**
 * Extracts URLs from HTML.
 */
function extractFromHtml(html: string): readonly string[] {
  const doc = parseDocument(html, {
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
  });

  const urls = new Set<string>();

  function traverse(node: ChildNode): void {
    if (isElement(node)) {
      // Extract href from anchor tags
      if (node.name === "a") {
        const href = node.attribs.href;
        if (href != null && isValidUrl(href)) {
          urls.add(href);
        }
      }

      // Traverse children
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const child of doc.children) {
    traverse(child);
  }

  return [...urls];
}

/**
 * Checks if a URL is valid for extraction.
 * Only allows http:// and https:// URLs.
 */
function isValidUrl(url: string): boolean {
  if (url.length === 0 || url === "#") {
    return false;
  }

  // Skip javascript:, mailto:, tel:, and other non-http schemes
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
