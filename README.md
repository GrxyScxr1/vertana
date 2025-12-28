Vertana: LLM-powered agentic translation library for TypeScript
===============================================================

> [!CAUTION]
> Vertana is currently in early development for proof of concept purposes,
> and is not yet ready for production use.  The API is subject to change,
> and there may be bugs or missing features.

Vertana is an LLM-powered agentic translation library for TypeScript/JavaScript.
It goes beyond simple LLM prompting by using autonomous agent workflows to
gather rich contextual information, ensuring high-quality translations that
preserve meaning, tone, formatting.


Packages
--------

Vertana is a monorepo which contains multiple packages.  If you are looking for
one package to start with, check out *@vertana/facade*.  The following is a list
of the available packages:

| Package                              | JSR                        | npm                        | Description                                  |
| ------------------------------------ | -------------------------- | -------------------------- | -------------------------------------------- |
| [@vertana/core](/packages/core/)     | [JSR][jsr:@vertana/core]   | [npm][npm:@vertana/core]   | Shared types and common functionality        |
| [@vertana/facade](/packages/facade/) | [JSR][jsr:@vertana/facade] | [npm][npm:@vertana/facade] | High-level facade for easy translation tasks |

[jsr:@vertana/core]: https://jsr.io/@vertana/core
[npm:@vertana/core]: https://www.npmjs.com/package/@vertana/core
[jsr:@vertana/facade]: https://jsr.io/@vertana/facade
[npm:@vertana/facade]: https://www.npmjs.com/package/@vertana/facade
