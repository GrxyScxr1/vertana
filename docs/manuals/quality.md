---
description: >-
  Guide to improving translation quality with chunking, evaluation, iterative
  refinement, and best-of-N selection.
---

Translation quality
===================

Vertana provides several features to improve translation quality beyond a
single LLM pass.  This guide covers document chunking, quality evaluation,
iterative refinement, and best-of-N model selection.


Document chunking
-----------------

Long documents are split into smaller chunks for translation.  This improves
quality by keeping each translation request within the model's optimal context
window and allowing for chunk-level quality control.


### Why chunking matters

LLMs have context limits and tend to perform better with focused input.
Chunking:

 -  Keeps each request within optimal token limits
 -  Enables progress tracking for long documents
 -  Allows quality evaluation and refinement per chunk
 -  Enables parallel translation of independent chunks


### Media type-aware chunking

Vertana selects chunkers based on the document's media type:

`text/plain`
:   Splits on paragraph boundaries and sentences.

`text/markdown`
:   Preserves Markdown structure: headings, code blocks, lists.

`text/html`
:   Preserves HTML tags and structure.

~~~~ typescript twoslash
const markdownDocument: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "ko",
  markdownDocument,
  { mediaType: "text/markdown" }
);
~~~~


### Controlling chunk size

The context window option controls chunk size:

~~~~ typescript twoslash
const longDocument: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "ko",
  longDocument,
  {
    contextWindow: {
      type: "explicit",
      maxTokens: 4096,  // Tokens per chunk
    },
  }
);
~~~~


### Disabling chunking

For short texts or when you want full-document context:

~~~~ typescript twoslash
const shortText: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "ko",
  shortText,
  { chunker: null }
);
~~~~


Translation evaluation
----------------------

Vertana can evaluate translation quality using an LLM judge.  Evaluation
produces a score and identifies specific issues.


### Evaluation criteria

Translations are evaluated on four dimensions:

`accuracy`
:   Does the translation accurately convey the original meaning?

`fluency`
:   Is the translation natural and readable in the target language?

`terminology`
:   Are domain-specific terms translated correctly and consistently?

`style`
:   Does the translation maintain the appropriate tone?


### Evaluation result structure

Evaluation returns a score and a list of issues:

~~~~ typescript twoslash
import type { EvaluationResult, TranslationIssue } from "@vertana/core/evaluation";

const result: EvaluationResult = {
  score: 0.85,  // 0-1, where 1 is perfect
  issues: [
    {
      type: "terminology",
      description: "Term 'chunk' inconsistently translated",
      location: { start: 45, end: 52 },
    },
  ],
};
~~~~


### Score interpretation

| Score | Quality |
| ----- | ------- |
| 0.9+  | Excellent |
| 0.7-0.9 | Good |
| 0.5-0.7 | Acceptable |
| < 0.5 | Poor |


Iterative refinement
--------------------

The refinement feature iteratively improves translations through an
evaluate-fix loop.  Each iteration identifies issues and produces a
revised translation until the quality threshold is met.


### Enabling refinement

Enable refinement with the `refinement` option:

~~~~ typescript twoslash
const document: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "ko",
  document,
  { refinement: true }
);

console.log(result.qualityScore);         // Final quality score
console.log(result.refinementIterations); // Number of iterations performed
~~~~


### Customizing refinement

Fine-tune the refinement process with `RefinementOptions`:

~~~~ typescript twoslash
const document: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";

const result = await translate(
  openai("gpt-4o"),
  "ko",
  document,
  {
    refinement: {
      maxIterations: 5,       // Maximum refinement passes (default: 3)
      qualityThreshold: 0.95, // Stop when score exceeds this (default: 0.9)
    },
  }
);
~~~~

`maxIterations`
:   Maximum number of refinement attempts per chunk (default: `3`).

`qualityThreshold`
:   Target quality score; refinement stops when reached (default: `0.9`).


### How refinement works

1. Translate the document (or chunk)
2. Evaluate the translation quality
3. If score < threshold and iterations < max:
   - Identify specific issues
   - Generate improved translation addressing those issues
   - Re-evaluate
   - Repeat
4. Return the final refined translation


Best-of-N selection
-------------------

When you provide multiple language models, Vertana can generate translations
from each and automatically select the best one.


### Basic usage

Pass an array of models and enable best-of-N:

~~~~ typescript twoslash
const document: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

const result = await translate(
  [openai("gpt-4o"), anthropic("claude-sonnet-4-20250514")],
  "ko",
  document,
  { bestOfN: true }
);

console.log(result.selectedModel); // The model that produced the best translation
~~~~


### Specifying an evaluator model

By default, the first model evaluates all candidates.  Specify a different
evaluator:

~~~~ typescript twoslash
const document: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

const result = await translate(
  [openai("gpt-4o"), anthropic("claude-sonnet-4-20250514")],
  "ko",
  document,
  {
    bestOfN: {
      evaluatorModel: google("gemini-2.0-flash"),
    },
  }
);
~~~~


### How selection works

1. Each model translates the text independently
2. The evaluator model scores each translation
3. Translations are ranked by score
4. The highest-scoring translation is selected
5. `result.selectedModel` indicates which model produced it


Combining features
------------------

These features can be combined for maximum quality:

~~~~ typescript twoslash
const document: string = "";
// ---cut-before---
import { translate } from "@vertana/facade";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

const result = await translate(
  [openai("gpt-4o"), anthropic("claude-sonnet-4-20250514")],
  "ko",
  document,
  {
    mediaType: "text/markdown",
    glossary: [
      { original: "Vertana", translated: "버타나" },
    ],
    dynamicGlossary: true,
    refinement: {
      maxIterations: 3,
      qualityThreshold: 0.9,
    },
    bestOfN: true,
    onProgress: (progress) => {
      console.log(`${progress.stage}: ${(progress.progress * 100).toFixed(0)}%`);
    },
  }
);

console.log("Quality score:", result.qualityScore);
console.log("Selected model:", result.selectedModel);
console.log("Refinement iterations:", result.refinementIterations);
console.log("Accumulated terms:", result.accumulatedGlossary?.length);
~~~~

The processing order is:

1. Chunk the document
2. For each chunk:
   - Gather context from sources
   - Translate with each model
   - Evaluate and select best
   - Refine if below threshold
   - Extract terms for dynamic glossary
3. Combine refined chunks


Tracking progress
-----------------

Monitor the translation process with the `onProgress` callback:

~~~~ typescript twoslash
import type { TranslationProgress } from "@vertana/facade";

function handleProgress(progress: TranslationProgress): void {
  switch (progress.stage) {
    case "chunking":
      console.log("Splitting document into chunks...");
      break;
    case "gatheringContext":
      console.log("Gathering context from sources...");
      break;
    case "translating":
      if (progress.totalChunks) {
        console.log(`Translating chunk ${progress.chunkIndex! + 1}/${progress.totalChunks}`);
      }
      break;
    case "refining":
      console.log(`Refining: iteration ${progress.iteration}/${progress.maxIterations}`);
      break;
    case "selecting":
      console.log(`Evaluating candidate ${progress.candidateIndex! + 1}/${progress.totalCandidates}`);
      break;
  }
}
~~~~
