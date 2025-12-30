/**
 * Web context gathering for Vertana — fetch and extract content from
 * linked pages to provide additional context for translation.
 *
 * @module
 * @since 0.1.0
 */

export {
  extractContent,
  type ExtractedContent,
  fetchLinkedPages,
  type FetchLinkedPagesOptions,
  fetchWebPage,
} from "./fetch.ts";

export { extractLinks, type MediaType } from "./extract-links.ts";
