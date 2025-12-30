# @vertana/context-web

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

Web context gathering for [Vertana] — fetch and extract content from
linked pages to provide additional context for translation.

[JSR]: https://jsr.io/@vertana/context-web
[JSR badge]: https://jsr.io/badges/@vertana/context-web
[npm]: https://www.npmjs.com/package/@vertana/context-web
[npm badge]: https://img.shields.io/npm/v/@vertana/context-web
[Vertana]: https://vertana.org/


Features
--------

 -  **fetchWebPage**: A passive context source that fetches a single URL
    and extracts the main content using Mozilla's Readability algorithm.
 -  **fetchLinkedPages**: A required context source factory that extracts
    all links from the source text and fetches their content.
 -  **extractLinks**: A utility function to extract URLs from text
    in various formats (plain text, Markdown, HTML).


Installation
------------

### Deno

~~~~ bash
deno add jsr:@vertana/context-web
~~~~

### npm

~~~~ bash
npm add @vertana/context-web
~~~~

### pnpm

~~~~ bash
pnpm add @vertana/context-web
~~~~


Usage
-----

~~~~ typescript
import { translate } from "@vertana/facade";
import { fetchLinkedPages, fetchWebPage } from "@vertana/context-web";
import { openai } from "@ai-sdk/openai";

const text = `
Check out this article: https://example.com/article
It explains the concept in detail.
`;

const result = await translate(openai("gpt-4o"), "ko", text, {
  contextSources: [
    // Automatically fetch all links in the text
    fetchLinkedPages({ text, mediaType: "text/plain" }),
    // Allow LLM to fetch additional URLs on demand
    fetchWebPage,
  ],
});
~~~~


License
-------

[MIT License](../../LICENSE)
