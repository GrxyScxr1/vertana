---
description: >-
  Guide to using @vertana/context-web for fetching and extracting content
  from linked web pages to provide additional translation context.
---

Web context
===========

The *@vertana/context-web* package provides context sources that fetch and
extract content from web pages.  This is useful when translating documents
that reference external articles or resources.


Installation
------------

::: code-group

~~~~ bash [Deno]
deno add jsr:@vertana/context-web
~~~~

~~~~ bash [npm]
npm add @vertana/context-web
~~~~

~~~~ bash [pnpm]
pnpm add @vertana/context-web
~~~~

~~~~ bash [Yarn]
yarn add @vertana/context-web
~~~~

~~~~ bash [Bun]
bun add @vertana/context-web
~~~~

:::


Overview
--------

This package provides two main context sources:

[`fetchWebPage`](#fetchwebpage)
:   A passive context source that fetches a single URL on demand.
    The LLM can call this tool when it needs additional context.

[`fetchLinkedPages`](#fetchlinkedpages)
:   A required context source factory that extracts all links from the
    source text and fetches their content before translation begins.

Both use [Mozilla's Readability] algorithm to extract the main article
content from web pages, filtering out navigation, ads, and other noise.

[Mozilla's Readability]: https://github.com/mozilla/readability


`fetchWebPage`
--------------

A passive context source that the LLM can invoke when it needs to fetch
a specific URL.

~~~~ typescript twoslash
import type { LanguageModel } from "ai";
declare const model: LanguageModel;
// ---cut-before---
import { translate } from "@vertana/facade";
import { fetchWebPage } from "@vertana/context-web";

const text = `
This article discusses the concept explained at https://example.com/guide.
`;

const result = await translate(model, "ko", text, {
  contextSources: [fetchWebPage],
});
~~~~

When the LLM encounters a reference it wants to understand better, it can
call the `fetch-web-page` tool with the URL to retrieve the page content.


`fetchLinkedPages`
------------------

A factory function that creates a required context source.  It extracts
all URLs from the source text and fetches their content before translation
begins.

~~~~ typescript twoslash
import type { LanguageModel } from "ai";
declare const model: LanguageModel;
// ---cut-before---
import { translate } from "@vertana/facade";
import { fetchLinkedPages } from "@vertana/context-web";

const text = `
Check out https://example.com/article for background.
Also see https://example.com/reference for more details.
`;

const result = await translate(model, "ko", text, {
  contextSources: [
    fetchLinkedPages({
      text,
      mediaType: "text/plain",
    }),
  ],
});
~~~~


### Options

`text`
:   The source text to extract links from.

`mediaType`
:   The media type of the text (`"text/plain"`, `"text/markdown"`,
    or `"text/html"`).  This affects how links are extracted.

`maxLinks`
:   Maximum number of links to fetch.  Defaults to `10`.

`timeout`
:   Timeout for each fetch request in milliseconds.  Defaults to `10000`.


Combining both sources
----------------------

For best results, use both sources together.  `fetchLinkedPages` provides
context from links in the source text, while `fetchWebPage` allows the
LLM to fetch additional URLs it discovers during translation.

~~~~ typescript twoslash
import type { LanguageModel } from "ai";
declare const model: LanguageModel;
// ---cut-before---
import { translate } from "@vertana/facade";
import { fetchLinkedPages, fetchWebPage } from "@vertana/context-web";

const text = `
Read the introduction at https://example.com/intro.
`;

const result = await translate(model, "ko", text, {
  contextSources: [
    // Pre-fetch all links in the text
    fetchLinkedPages({ text, mediaType: "text/plain" }),
    // Allow LLM to fetch additional URLs on demand
    fetchWebPage,
  ],
});
~~~~


extractLinks utility
--------------------

The `extractLinks` function extracts URLs from text.  It's used internally
by `fetchLinkedPages` but is also exported for custom use cases.

~~~~ typescript twoslash
import { extractLinks } from "@vertana/context-web";

// From plain text
const plainUrls = extractLinks(
  "Check https://example.com for info.",
  "text/plain"
);
// => ["https://example.com"]

// From Markdown
const mdUrls = extractLinks(
  "See [this article](https://example.com/article).",
  "text/markdown"
);
// => ["https://example.com/article"]

// From HTML
const htmlUrls = extractLinks(
  '<a href="https://example.com">Link</a>',
  "text/html"
);
// => ["https://example.com"]
~~~~


CLI usage
---------

The Vertana CLI includes the `-L` or `--fetch-links` flag that enables
web context fetching:

~~~~ bash
vertana translate -t ko -L document.md
~~~~

This automatically:

 1. Extracts all links from the input document
 2. Fetches and extracts content from linked pages
 3. Provides the content as context for translation

See the [*CLI reference*](./cli.md) for more details.
