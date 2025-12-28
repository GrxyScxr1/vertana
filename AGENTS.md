Guidance for LLM-based code agents
==================================

This file provides guidance to LLM-based code agents (e.g., Claude Code,
OpenCode) when working with code in this repository.


Project overview
----------------

Vertana is an LLM-powered agentic translation library for TypeScript/JavaScript.
It uses autonomous agent workflows to gather contextual information for
high-quality translations that preserve meaning, tone, and formatting.
The library uses the [Vercel AI SDK] (*ai* package) for LLM interactions.

[Vercel AI SDK]: https://sdk.vercel.ai/


Development commands
--------------------

This is a polyglot monorepo supporting Deno, Node.js, and Bun.
Use [mise] to manage runtime versions.

[mise]: https://mise.jdx.dev/

### Package manager

This project uses Deno as the primary development tool and pnpm for
npm-related tasks (building for npm publishing).

> [!IMPORTANT]
> Do *not* use npm or Yarn as package managers in this project.  Always use
> Deno tasks (`deno task ...`) for development workflows and pnpm
> (`pnpm run ...`) only for npm build tasks.

### Installation

~~~~ bash
mise run install
~~~~

### Quality checks

~~~~ bash
deno task check  # Type check, lint, format check, and dry-run publish
deno fmt         # Format code
deno lint        # Run linter
~~~~

### Testing

~~~~ bash
mise run test:deno   # Run tests with Deno (requires .env.test file)
mise run test:node   # Run tests with Node.js
mise run test:bun    # Run tests with Bun
mise run test        # Run all checks and tests across all runtimes
~~~~

### Building (for npm publishing)

~~~~bash
pnpm run -r build        # Build all packages with tsdown
~~~~

### Version management

All packages must share the same version.  Use the check-versions script:

~~~~ bash
mise run check-versions          # Check for version mismatches
mise run check-versions --fix    # Auto-fix version mismatches
~~~~

### Adding dependencies

When adding new dependencies, always check for the latest version:

 -  *npm packages*: Use `npm view <package> version` to find the latest version
 -  *JSR packages*: Use the [JSR API] to find the latest version

Always prefer the latest stable version unless there is a specific reason
to use an older version.

[JSR API]: https://jsr.io/docs/api


Architecture
------------

### Package structure

 -  *@vertana/core* (*packages/core/*): Shared types and common functionality.
 -  *@vertana/facade* (*packages/facade/*): High-level facade for translation
    tasks.  Contains the main `translate()` function API.

### Dual publishing

Each package is published to both JSR (Deno) and npm (Node.js/Bun):

 -  JSR uses *deno.json* with TypeScript source directly
 -  npm uses *package.json* with tsdown-built *dist/* output (ESM + CJS + .d.ts)

### Key dependencies

 -  *ai* (Vercel AI SDK): LLM abstraction layer, used via `LanguageModel`
    interface
 -  *@logtape/logtape*: Logging framework
 -  *@standard-schema/spec*: Schema validation interface for library-agnostic
    schema definitions


Code style
----------

### Type safety

 -  All code must be type-safe.  Avoid using the `any` type.
 -  Do not use unsafe type assertions like `as unknown as ...` to bypass
    the type system.
 -  Prefer immutable data structures unless there is a specific reason to
    use mutable ones.  Use `readonly T[]` for array types and add the
    `readonly` modifier to all interface fields.
 -  Use the nullish coalescing operator (`??`) instead of the logical OR
    operator (`||`) for default values.

### Async patterns

 -  All async functions must accept an `AbortSignal` parameter to support
    cancellation.

### API documentation

 -  All exported APIs must have JSDoc comments describing their purpose,
    parameters, and return values.
 -  For APIs added in a specific version, include the `@since` tag with the
    version number:

    ~~~~ typescript
    /**
     * Translates the given text to the target language.
     *
     * @param text The text to translate.
     * @param targetLanguage The target language code.
     * @returns The translated text.
     * @since 1.2.3
     */
    export function translate(text: string, targetLanguage: string): string {
      // ...
    }
    ~~~~

### Testing

 -  Use the `node:test` and `node:assert/strict` APIs to ensure tests run
    across all runtimes (Node.js, Deno, and Bun).
 -  Avoid the `assert.equal(..., true)` or `assert.equal(..., false)` patterns.
    Use `assert.ok(...)` and `assert.ok(!...)` instead.


Markdown style guide
--------------------

When creating or editing Markdown documentation files in this project,
follow these style conventions to maintain consistency with existing
documentation:

### Headings

 -  *Setext-style headings*: Use underline-style for the document title
    (with `=`) and sections (with `-`):

    ~~~~
    Document Title
    ==============

    Section Name
    ------------
    ~~~~

 -  *ATX-style headings*: Use only for subsections within a section:

    ~~~~
    ### Subsection Name
    ~~~~

 -  *Heading case*: Use sentence case (capitalize only the first word and
    proper nouns) rather than Title Case:

    ~~~~
    Development commands    ← Correct
    Development Commands    ← Incorrect
    ~~~~

### Text formatting

 -  *Italics* (`*text*`): Use for package names (*@vertana/core*,
    *@vertana/facade*), emphasis, and to distinguish concepts
 -  *Bold* (`**text**`): Use sparingly for strong emphasis
 -  *Inline code* (`` `code` ``): Use for code spans, function names,
    filenames, and command-line options

### Lists

 -  Use ` -  ` (space-hyphen-two spaces) for unordered list items
 -  Indent nested items with 4 spaces
 -  Align continuation text with the item content:

    ~~~~
     -  *First item*: Description text that continues
        on the next line with proper alignment
     -  *Second item*: Another item
    ~~~~

### Code blocks

 -  Use four tildes (`~~~~`) for code fences instead of backticks
 -  Always specify the language identifier:

    ~~~~~
    ~~~~ typescript
    const example = "Hello, world!";
    ~~~~
    ~~~~~

 -  For shell commands, use `bash`:

    ~~~~~
    ~~~~ bash
    deno test
    ~~~~
    ~~~~~

### Links

 -  Use reference-style links placed at the *end of each section*
    (not at document end)
 -  Format reference links with consistent spacing:

    ~~~~
    See the [Vercel AI SDK] for LLM abstraction.

    [Vercel AI SDK]: https://sdk.vercel.ai/
    ~~~~

### GitHub alerts

Use GitHub-style alert blocks for important information:

 -  *Note*: `> [!NOTE]`
 -  *Tip*: `> [!TIP]`
 -  *Important*: `> [!IMPORTANT]`
 -  *Warning*: `> [!WARNING]`
 -  *Caution*: `> [!CAUTION]`

Continue alert content on subsequent lines with `>`:

~~~~
> [!CAUTION]
> This feature is experimental and may change in future versions.
~~~~

### Tables

Use pipe tables with proper alignment markers:

~~~~
| Package         | Description                   |
| --------------- | ----------------------------- |
| @vertana/core   | Shared types and common code  |
~~~~

### Spacing and line length

 -  Wrap lines at approximately 80 characters for readability
 -  Use one blank line between sections and major elements
 -  Use two blank lines before Setext-style section headings
 -  Place one blank line before and after code blocks
 -  End sections with reference links (if any) followed by a blank line
