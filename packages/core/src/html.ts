import type { ChildNode, Document, Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import type { Chunk, Chunker, ChunkerOptions, ChunkType } from "./chunking.ts";
import { countTokens as defaultCountTokens } from "./tokens.ts";

/**
 * Options specific to HTML chunking.
 *
 * @since 0.2.0
 */
export interface HtmlChunkerOptions {
  /**
   * Additional HTML attributes to include for translation.
   * Default translatable attributes: alt, title, placeholder, aria-label,
   * aria-description.
   */
  readonly additionalTranslatableAttributes?: readonly string[];

  /**
   * Whether to strip HTML comments from the output.
   *
   * @default false
   */
  readonly stripComments?: boolean;
}

/**
 * Default attributes that should be translated.
 */
const DEFAULT_TRANSLATABLE_ATTRIBUTES = [
  "alt",
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
] as const;

/**
 * Block-level elements that create natural chunk boundaries.
 */
const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "canvas",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "noscript",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
  "video",
]);

/**
 * Elements whose content should not be translated.
 */
const NON_TRANSLATABLE_ELEMENTS = new Set(["script", "style", "svg", "math"]);

/**
 * A parsed HTML block representing a translatable unit.
 */
interface HtmlBlock {
  /**
   * The HTML content of the block.
   */
  readonly html: string;

  /**
   * The determined chunk type.
   */
  readonly type: ChunkType;
}

/**
 * Determines if a node is an element.
 */
function isElement(node: ChildNode): node is Element {
  return node.type === "tag";
}

/**
 * Determines if an element is a block-level element.
 */
function isBlockElement(node: ChildNode): node is Element {
  return isElement(node) && BLOCK_ELEMENTS.has(node.name.toLowerCase());
}

/**
 * Determines if an element should be excluded from translation.
 */
function isNonTranslatable(node: ChildNode): boolean {
  return isElement(node) &&
    NON_TRANSLATABLE_ELEMENTS.has(node.name.toLowerCase());
}

/**
 * Determines the chunk type from an HTML element.
 */
function getChunkTypeFromElement(element: Element): ChunkType {
  const name = element.name.toLowerCase();

  if (/^h[1-6]$/.test(name)) {
    return "heading";
  }
  if (["ul", "ol", "dl"].includes(name)) {
    return "list";
  }
  if (["pre", "code"].includes(name)) {
    return "code";
  }
  if (
    ["section", "article", "header", "footer", "nav", "aside", "main"].includes(
      name,
    )
  ) {
    return "section";
  }
  return "paragraph";
}

/**
 * Gets the text content of a node (for checking if it has translatable
 * content).
 */
function getTextContent(node: ChildNode | Document): string {
  if ("type" in node && node.type === "text") {
    return (node as { data: string }).data;
  }
  if ("children" in node) {
    return node.children.map((child) => getTextContent(child)).join("");
  }
  return "";
}

/**
 * Checks if an element has any translatable attributes.
 */
function hasTranslatableAttributes(node: ChildNode): boolean {
  if (!isElement(node)) {
    return false;
  }

  // Check for translatable attributes on this element
  for (const attr of DEFAULT_TRANSLATABLE_ATTRIBUTES) {
    const value = node.attribs[attr];
    if (value != null && value.trim().length > 0) {
      return true;
    }
  }

  // Recursively check children
  for (const child of node.children) {
    if (hasTranslatableAttributes(child)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a node has any translatable content.
 */
function hasTranslatableContent(node: ChildNode): boolean {
  if (isNonTranslatable(node)) {
    return false;
  }
  const text = getTextContent(node).trim();
  if (text.length > 0) {
    return true;
  }
  // Check for translatable attributes (like alt, title)
  return hasTranslatableAttributes(node);
}

/**
 * Extracts translatable blocks from an HTML document.
 */
function extractBlocks(
  doc: Document,
  _options: HtmlChunkerOptions,
): readonly HtmlBlock[] {
  const blocks: HtmlBlock[] = [];

  function processNode(node: ChildNode): void {
    // Only process element nodes
    if (!isElement(node)) {
      return;
    }

    const name = node.name.toLowerCase();

    // Skip non-translatable elements entirely
    if (NON_TRANSLATABLE_ELEMENTS.has(name)) {
      return;
    }

    // If it's a block element, create a chunk for it
    if (BLOCK_ELEMENTS.has(name)) {
      if (hasTranslatableContent(node)) {
        blocks.push({
          html: render(node),
          type: getChunkTypeFromElement(node),
        });
      }
      return;
    }

    // For non-block elements (like <span>, <a>), recurse into children
    for (const child of node.children) {
      processNode(child);
    }
  }

  // Process all top-level nodes
  for (const node of doc.children) {
    processNode(node);
  }

  return blocks;
}

/**
 * Splits text content at sentence boundaries.
 */
function splitAtSentences(text: string): readonly string[] {
  // Split at sentence-ending punctuation followed by whitespace
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.filter((p) => p.trim().length > 0);
}

/**
 * Splits an HTML block into smaller pieces if it exceeds the token limit.
 */
function splitHtmlBlock(
  block: HtmlBlock,
  maxTokens: number,
  countTokens: (text: string) => number,
): readonly HtmlBlock[] {
  const tokens = countTokens(block.html);
  if (tokens <= maxTokens) {
    return [block];
  }

  // Parse the block to find split points
  const doc = parseDocument(block.html);
  const children = doc.children;

  // If it's a single element with block children, split by children
  if (children.length === 1 && isElement(children[0])) {
    const element = children[0];
    const blockChildren = element.children.filter(isBlockElement);

    if (blockChildren.length > 1) {
      // Split by block children
      const result: HtmlBlock[] = [];
      for (const child of blockChildren) {
        const childBlocks = splitHtmlBlock(
          { html: render(child), type: getChunkTypeFromElement(child) },
          maxTokens,
          countTokens,
        );
        result.push(...childBlocks);
      }
      return result;
    }
  }

  // Try to split by text content (sentences)
  const text = getTextContent(doc);
  const sentences = splitAtSentences(text);

  if (sentences.length > 1) {
    const result: HtmlBlock[] = [];
    let currentText = "";

    for (const sentence of sentences) {
      const combined = currentText ? `${currentText} ${sentence}` : sentence;
      if (countTokens(combined) <= maxTokens) {
        currentText = combined;
      } else {
        if (currentText) {
          result.push({ html: currentText, type: block.type });
        }
        currentText = sentence;
      }
    }

    if (currentText) {
      result.push({ html: currentText, type: block.type });
    }

    return result;
  }

  // Cannot split further, return as-is
  return [block];
}

/**
 * Creates an HTML chunker.
 *
 * The chunker parses HTML content and creates chunks that respect element
 * boundaries.  Each block element is kept as a single chunk when possible,
 * and only split when exceeding the token limit.
 *
 * @param htmlOptions Optional HTML-specific chunking options.
 * @returns A chunker function for HTML content.
 * @since 0.2.0
 */
export function createHtmlChunker(htmlOptions?: HtmlChunkerOptions): Chunker {
  const options = htmlOptions ?? {};

  return async (
    text: string,
    chunkerOptions?: ChunkerOptions,
  ): Promise<readonly Chunk[]> => {
    const maxTokens = chunkerOptions?.maxTokens ?? 4096;
    const countTokens = chunkerOptions?.countTokens ?? defaultCountTokens;
    const signal = chunkerOptions?.signal;

    signal?.throwIfAborted();
    await Promise.resolve();

    // Handle empty input
    if (text.trim().length === 0) {
      return [];
    }

    // Parse HTML
    const doc = parseDocument(text, {
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    });

    // Extract translatable blocks
    const blocks = extractBlocks(doc, options);

    // Create chunks with splitting if needed
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    for (const block of blocks) {
      signal?.throwIfAborted();

      const splitBlocks = splitHtmlBlock(block, maxTokens, countTokens);
      for (const splitBlock of splitBlocks) {
        chunks.push({
          content: splitBlock.html,
          type: splitBlock.type,
          index: chunkIndex++,
        });
      }
    }

    return chunks;
  };
}

export { DEFAULT_TRANSLATABLE_ATTRIBUTES };
