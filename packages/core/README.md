@vertana/core
=============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

> [!CAUTION]
> Vertana is currently in early development for proof of concept purposes,
> and is not yet ready for production use.  The API is subject to change,
> and there may be bugs or missing features.

Core translation logic and utilities for [Vertana].  Contains chunking,
context gathering, evaluation, refinement, selection, and translation
orchestration.

> [!TIP]
> *Building an application?*  Consider *@vertana/facade* for a simpler API.
> This core package is for when you need fine-grained control over the
> translation pipeline.

[JSR badge]: https://jsr.io/badges/@vertana/core
[JSR]: https://jsr.io/@vertana/core
[npm badge]: https://img.shields.io/npm/v/@vertana/core?logo=npm
[npm]: https://www.npmjs.com/package/@vertana/core
[Vertana]: https://vertana.org/


When to use @vertana/core
-------------------------

Use *@vertana/core* when:

 -  Building custom translation workflows
 -  Need fine-grained control over each translation stage
 -  Implementing custom chunking strategies
 -  Working with streaming translation events

Use *@vertana/facade* when:

 -  Want a simple async/await API
 -  Standard translation with sensible defaults
 -  Progress reporting with callbacks


Installation
------------

~~~~ bash
deno add jsr:@vertana/core
npm  add     @vertana/core
pnpm add     @vertana/core
~~~~


Quick example
-------------

~~~~ typescript
import { translateChunks, chunkText } from "@vertana/core";
import { openai } from "@ai-sdk/openai";

const chunks = await chunkText("Your long document here...", {
  mediaType: "text/markdown",
});

for await (const event of translateChunks(chunks, {
  models: [openai("gpt-4o")],
  targetLanguage: "ko",
})) {
  if (event.type === "chunk") {
    console.log(event.translation);
  }
}
~~~~


Key modules
-----------

 -  *Chunking*: `@vertana/core/chunking` — Text splitting with media type
    awareness (plain text, Markdown, HTML)
 -  *Context*: `@vertana/core/context` — Required and passive context sources
    for agentic workflows
 -  *Evaluation*: `@vertana/core/evaluation` — Quality scoring across
    accuracy, fluency, terminology, style
 -  *Refinement*: `@vertana/core/refine` — Iterative improvement with
    boundary coherence
 -  *Selection*: `@vertana/core/select` — Best-of-N evaluation with
    multiple models
 -  *Glossary*: `@vertana/core/glossary` — Dynamic term accumulation

For more resources, see the [docs].

[docs]: https://vertana.org/
