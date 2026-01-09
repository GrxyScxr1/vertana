@vertana/facade
===============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

> [!CAUTION]
> Vertana is currently in early development for proof of concept purposes,
> and is not yet ready for production use.  The API is subject to change,
> and there may be bugs or missing features.

High-level facade for [Vertana] providing a simple `translate()` function
with sensible defaults.  This is the recommended starting point for most
applications.

[JSR badge]: https://jsr.io/badges/@vertana/facade
[JSR]: https://jsr.io/@vertana/facade
[npm badge]: https://img.shields.io/npm/v/@vertana/facade?logo=npm
[npm]: https://www.npmjs.com/package/@vertana/facade
[Vertana]: https://vertana.org/


Installation
------------

~~~~ bash
deno add jsr:@vertana/facade
npm  add     @vertana/facade
pnpm add     @vertana/facade
~~~~


Quick example
-------------

~~~~ typescript
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "ko",
  "Hello, world!"
);

console.log(result.text);
~~~~


Features
--------

 -  *Single function API*: `translate()` handles the entire pipeline
 -  *Progress reporting*: Track chunking, translation, refinement stages
 -  *Flexible options*: Tone, domain, glossary, context sources
 -  *Quality features*: Refinement and best-of-N selection
 -  *Cancellation*: AbortSignal support


Options
-------

The `translate()` function accepts an optional `TranslateOptions` object:

 -  `mediaType`: Input format (`"text/plain"`, `"text/markdown"`, `"text/html"`)
 -  `tone`: Style preference (formal, informal, technical, etc.)
 -  `domain`: Subject area for terminology
 -  `glossary`: Pre-defined terminology mappings
 -  `contextSources`: External context providers
 -  `refinement`: Enable iterative quality improvement
 -  `bestOfN`: Multi-model selection for best translation
 -  `onProgress`: Callback for progress updates
 -  `signal`: AbortSignal for cancellation

For more resources, see the [docs].

[docs]: https://vertana.org/
