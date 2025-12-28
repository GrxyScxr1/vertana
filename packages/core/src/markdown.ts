import type { Chunk, Chunker, ChunkerOptions, ChunkType } from "./chunking.ts";
import { countTokens as defaultCountTokens } from "./tokens.ts";

/**
 * A section of Markdown content starting with a heading.
 */
interface Section {
  /**
   * The heading text (including the heading markers).
   */
  readonly heading: string;

  /**
   * The content under this heading (excluding the heading itself).
   */
  readonly content: string;

  /**
   * The heading level (1-6 for ATX, 1-2 for Setext).
   */
  readonly level: number;
}

/**
 * Checks if a line is an ATX-style heading.
 *
 * @param line The line to check.
 * @returns The heading level (1-6) or 0 if not a heading.
 */
function getAtxHeadingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s/);
  if (match != null) {
    return match[1].length;
  }
  return 0;
}

/**
 * Checks if a line is a Setext-style heading underline.
 *
 * @param line The line to check.
 * @returns The heading level (1 for =, 2 for -) or 0 if not an underline.
 */
function getSetextUnderlineLevel(line: string): number {
  const trimmed = line.trim();
  if (/^=+$/.test(trimmed) && trimmed.length >= 3) {
    return 1;
  }
  if (/^-+$/.test(trimmed) && trimmed.length >= 3) {
    return 2;
  }
  return 0;
}

/**
 * Checks if a line starts a code fence at column 0 (not indented).
 *
 * @param line The line to check.
 * @returns The fence pattern if it's a code fence start, null otherwise.
 */
function getCodeFenceStart(line: string): string | null {
  // Only match code fences that start at column 0 (not indented)
  const match = line.match(/^(`{3,}|~{3,})/);
  if (match != null) {
    return match[1];
  }
  return null;
}

/**
 * Checks if a line closes a code fence.
 *
 * @param line The line to check.
 * @param fenceChar The fence character (` or ~).
 * @param fenceLength The minimum fence length.
 * @returns True if the line closes the fence.
 */
function isCodeFenceEnd(
  line: string,
  fenceChar: string,
  fenceLength: number,
): boolean {
  const pattern = new RegExp(`^${fenceChar}{${fenceLength},}\\s*$`);
  return pattern.test(line);
}

/**
 * Parses Markdown content into sections.
 *
 * Each section starts with a heading (ATX or Setext style) and contains
 * all content until the next heading of equal or higher level.
 *
 * @param text The Markdown text to parse.
 * @returns An array of sections.
 */
function parseIntoSections(text: string): readonly Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];

  let currentHeading = "";
  let currentLevel = 0;
  let currentLines: string[] = [];
  let inCodeBlock = false;
  let codeFenceChar = "";
  let codeFenceLength = 0;

  function flushSection(): void {
    if (currentHeading.length > 0 || currentLines.length > 0) {
      sections.push({
        heading: currentHeading,
        content: currentLines.join("\n").trim(),
        level: currentLevel,
      });
    }
    currentHeading = "";
    currentLevel = 0;
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks (only non-indented ones)
    if (inCodeBlock) {
      currentLines.push(line);
      if (isCodeFenceEnd(line, codeFenceChar, codeFenceLength)) {
        inCodeBlock = false;
        codeFenceChar = "";
        codeFenceLength = 0;
      }
      continue;
    }

    // Check for code fence start (only at column 0)
    const fence = getCodeFenceStart(line);
    if (fence != null) {
      currentLines.push(line);
      inCodeBlock = true;
      codeFenceChar = fence[0];
      codeFenceLength = fence.length;
      continue;
    }

    // Check for ATX-style heading
    const atxLevel = getAtxHeadingLevel(line);
    if (atxLevel > 0) {
      // New section starts
      flushSection();
      currentHeading = line;
      currentLevel = atxLevel;
      continue;
    }

    // Check for Setext-style heading (look ahead)
    if (
      i + 1 < lines.length &&
      line.trim().length > 0 &&
      !line.startsWith(" ") // Setext headings can't be indented
    ) {
      const setextLevel = getSetextUnderlineLevel(lines[i + 1]);
      if (setextLevel > 0) {
        // New section starts
        flushSection();
        currentHeading = `${line}\n${lines[i + 1]}`;
        currentLevel = setextLevel;
        i++; // Skip the underline
        continue;
      }
    }

    // Regular content line
    currentLines.push(line);
  }

  // Flush any remaining content
  flushSection();

  return sections;
}

/**
 * Determines the primary content type of a section's content.
 *
 * @param content The section content.
 * @returns The primary chunk type.
 */
function getSectionContentType(content: string): ChunkType {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return "paragraph";
  }

  // Check if mostly code
  let inCode = false;
  let codeLines = 0;
  let fenceChar = "";
  let fenceLength = 0;

  for (const line of lines) {
    if (inCode) {
      codeLines++;
      if (isCodeFenceEnd(line, fenceChar, fenceLength)) {
        inCode = false;
      }
    } else {
      const fence = getCodeFenceStart(line);
      if (fence != null) {
        inCode = true;
        fenceChar = fence[0];
        fenceLength = fence.length;
        codeLines++;
      }
    }
  }

  if (codeLines > lines.length / 2) {
    return "code";
  }

  // Check if mostly list (including continuation lines)
  let listItemCount = 0;
  let listContentLines = 0;
  let inListItem = false;
  let listMarkerIndent = -1;

  for (const line of lines) {
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s/);
    if (listMatch != null) {
      // New list item starts
      listItemCount++;
      listContentLines++;
      inListItem = true;
      listMarkerIndent = listMatch[1].length;
    } else if (inListItem) {
      // Check if this is a continuation line (indented beyond list marker)
      const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (lineIndent > listMarkerIndent) {
        // Continuation of previous list item
        listContentLines++;
      } else {
        // Not a continuation, exit list context
        inListItem = false;
      }
    }
  }

  if (listItemCount > 0 && listContentLines > lines.length / 2) {
    return "list";
  }

  return "paragraph";
}

/**
 * Splits text by sentences when line-level splitting isn't possible.
 *
 * @param text The text to split.
 * @param maxTokens The maximum tokens per piece.
 * @param countTokens The token counter function.
 * @returns An array of text pieces.
 */
function splitBySentences(
  text: string,
  maxTokens: number,
  countTokens: (text: string) => number,
): readonly string[] {
  // Split by sentence boundaries (., !, ?) followed by space
  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let currentPart = "";

  for (const sentence of sentences) {
    const newPart = currentPart.length > 0
      ? `${currentPart} ${sentence}`
      : sentence;

    if (countTokens(newPart) > maxTokens && currentPart.length > 0) {
      parts.push(currentPart);
      currentPart = sentence;
    } else {
      currentPart = newPart;
    }
  }

  if (currentPart.length > 0) {
    parts.push(currentPart);
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Splits a section's content into smaller pieces if it exceeds the token limit.
 *
 * @param content The content to split.
 * @param maxTokens The maximum tokens per piece.
 * @param countTokens The token counter function.
 * @returns An array of content pieces.
 */
function splitContent(
  content: string,
  maxTokens: number,
  countTokens: (text: string) => number,
): readonly string[] {
  if (countTokens(content) <= maxTokens) {
    return [content];
  }

  const parts: string[] = [];
  const paragraphs = content.split(/\n\n+/);
  let currentPart = "";

  for (const para of paragraphs) {
    const newPart = currentPart.length > 0 ? `${currentPart}\n\n${para}` : para;

    if (countTokens(newPart) > maxTokens) {
      if (currentPart.length > 0) {
        parts.push(currentPart);
      }

      // If single paragraph is too large, split by lines
      if (countTokens(para) > maxTokens) {
        const lines = para.split("\n");
        let linePart = "";
        for (const line of lines) {
          const newLinePart = linePart.length > 0
            ? `${linePart}\n${line}`
            : line;
          if (countTokens(newLinePart) > maxTokens && linePart.length > 0) {
            parts.push(linePart);
            linePart = line;
          } else {
            linePart = newLinePart;
          }
        }
        // If single line is still too large, split by sentences
        if (linePart.length > 0 && countTokens(linePart) > maxTokens) {
          const sentenceParts = splitBySentences(
            linePart,
            maxTokens,
            countTokens,
          );
          for (let i = 0; i < sentenceParts.length - 1; i++) {
            parts.push(sentenceParts[i]);
          }
          currentPart = sentenceParts[sentenceParts.length - 1];
        } else if (linePart.length > 0) {
          currentPart = linePart;
        }
      } else {
        currentPart = para;
      }
    } else {
      currentPart = newPart;
    }
  }

  if (currentPart.length > 0) {
    parts.push(currentPart);
  }

  return parts;
}

/**
 * Creates a Markdown chunker.
 *
 * The chunker parses Markdown content into sections (heading + content) and
 * creates chunks that respect section boundaries. Each section is kept as a
 * single chunk when possible, and only split when exceeding the token limit.
 *
 * @returns A chunker function for Markdown content.
 * @since 0.1.0
 */
export function createMarkdownChunker(): Chunker {
  return async (
    text: string,
    options?: ChunkerOptions,
  ): Promise<readonly Chunk[]> => {
    const maxTokens = options?.maxTokens ?? 4096;
    const countTokens = options?.countTokens ?? defaultCountTokens;
    const signal = options?.signal;

    // Check for abort before starting
    signal?.throwIfAborted();

    // Ensure this is truly async to satisfy linter
    await Promise.resolve();

    const sections = parseIntoSections(text);
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
      signal?.throwIfAborted();

      // Combine heading and content
      const fullSection =
        section.heading.length > 0 && section.content.length > 0
          ? `${section.heading}\n\n${section.content}`
          : section.heading.length > 0
          ? section.heading
          : section.content;

      if (fullSection.length === 0) {
        continue;
      }

      const sectionTokens = countTokens(fullSection);

      // If section fits in one chunk, add it directly
      if (sectionTokens <= maxTokens) {
        chunks.push({
          content: fullSection,
          type: section.heading.length > 0
            ? "section"
            : getSectionContentType(section.content),
          index: chunkIndex++,
        });
        continue;
      }

      // Section is too large, need to split
      // First, try to keep heading with first part of content
      if (section.heading.length > 0 && section.content.length > 0) {
        const headingTokens = countTokens(section.heading);
        const remainingTokens = maxTokens - headingTokens - countTokens("\n\n");

        if (remainingTokens > 0) {
          const contentParts = splitContent(
            section.content,
            remainingTokens,
            countTokens,
          );

          // First chunk includes heading
          if (contentParts.length > 0) {
            chunks.push({
              content: `${section.heading}\n\n${contentParts[0]}`,
              type: "section",
              index: chunkIndex++,
            });

            // Remaining chunks are just content
            for (let i = 1; i < contentParts.length; i++) {
              chunks.push({
                content: contentParts[i],
                type: getSectionContentType(contentParts[i]),
                index: chunkIndex++,
              });
            }
          } else {
            // Just the heading
            chunks.push({
              content: section.heading,
              type: "heading",
              index: chunkIndex++,
            });
          }
        } else {
          // Heading alone exceeds limit (unusual)
          chunks.push({
            content: section.heading,
            type: "heading",
            index: chunkIndex++,
          });

          const contentParts = splitContent(
            section.content,
            maxTokens,
            countTokens,
          );
          for (const part of contentParts) {
            chunks.push({
              content: part,
              type: getSectionContentType(part),
              index: chunkIndex++,
            });
          }
        }
      } else {
        // No heading, just split the content
        const contentParts = splitContent(fullSection, maxTokens, countTokens);
        for (const part of contentParts) {
          chunks.push({
            content: part,
            type: getSectionContentType(part),
            index: chunkIndex++,
          });
        }
      }
    }

    return chunks;
  };
}
