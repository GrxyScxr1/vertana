---
description: >-
  Instructions for installing Vertana and basic usage examples.
---

Getting started
===============

Vertana is an LLM-powered agentic translation library for TypeScript.
It uses autonomous agent workflows to gather contextual information for
high-quality translations that preserve meaning, tone, and formatting.


Installation
------------

Vertana consists of two packages:

 -  *@vertana/facade*: High-level API for translation tasks
 -  *@vertana/core*: Core translation logic (used internally by facade)

For most use cases, you only need to install the *@vertana/facade* package:

::: code-group

~~~~ bash [Deno]
deno add jsr:@vertana/facade
~~~~

~~~~ bash [npm]
npm add @vertana/facade
~~~~

~~~~ bash [pnpm]
pnpm add @vertana/facade
~~~~

~~~~ bash [Yarn]
yarn add @vertana/facade
~~~~

~~~~ bash [Bun]
bun add @vertana/facade
~~~~

:::


### Vercel AI SDK

Vertana uses the [Vercel AI SDK] for LLM interactions, so you'll also need to
install a model provider.  For example, to use OpenAI:

::: code-group

~~~~ bash [Deno]
deno add npm:@ai-sdk/openai
~~~~

~~~~ bash [npm]
npm add @ai-sdk/openai
~~~~

~~~~ bash [pnpm]
pnpm add @ai-sdk/openai
~~~~

~~~~ bash [Yarn]
yarn add @ai-sdk/openai
~~~~

~~~~ bash [Bun]
bun add @ai-sdk/openai
~~~~

:::

Supported providers include OpenAI, Anthropic, Google, Mistral, and more.
See the [Vercel AI SDK providers documentation] for the full list.

[Vercel AI SDK]: https://sdk.vercel.ai/
[Vercel AI SDK providers documentation]: https://sdk.vercel.ai/providers/ai-sdk-providers


Basic usage
-----------

The main entry point is the `translate()` function.  Here's a minimal example:

~~~~ typescript twoslash
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "ko",  // Target language (BCP 47 tag)
  "Hello, world! How are you today?"
);

console.log(result.text);
// => "안녕하세요! 오늘 기분이 어떠세요?"
~~~~

The `translate()` function takes three required arguments:

 1. A language model from the Vercel AI SDK
 2. The target language (as a BCP 47 language tag or [`Intl.Locale`])
 3. The text to translate

[`Intl.Locale`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale


### With options

You can customize the translation with various options:

~~~~ typescript twoslash
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "ja",
  "The patient presented with acute myocardial infarction.",
  {
    sourceLanguage: "en",
    domain: "medical",
    tone: "formal",
    context: "This is from a medical case study."
  }
);

console.log(result.text);
// => "患者は急性心筋梗塞を呈した。"
~~~~


### Tracking progress

For long documents, you can track translation progress:

~~~~ typescript twoslash
const longDocument: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "es",
  longDocument,
  {
    onProgress: (progress) => {
      console.log(`Stage: ${progress.stage}, Progress: ${progress.progress}`);
    }
  }
);
~~~~

Progress stages include `chunking`, `gatheringContext`, `translating`,
`refining`, and `selecting`.


Command-line interface
----------------------

Vertana also provides a CLI for quick translations.  Install it with:

::: code-group

~~~~ bash [Deno]
deno install -g --name vertana --allow-all jsr:@vertana/cli
~~~~

~~~~ bash [npm]
npm install -g @vertana/cli
~~~~

~~~~ bash [pnpm]
pnpm add -g @vertana/cli
~~~~

~~~~ bash [Bun]
bun add -g @vertana/cli
~~~~

:::

Then translate files directly from the terminal:

~~~~ bash
vertana translate -l ko document.md
~~~~
