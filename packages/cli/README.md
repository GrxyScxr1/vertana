@vertana/cli
============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

> [!CAUTION]
> Vertana is currently in early development for proof of concept purposes,
> and is not yet ready for production use.  The API is subject to change,
> and there may be bugs or missing features.

Command-line interface for [Vertana] translation.  Translate documents from
the terminal with support for multiple providers (OpenAI, Anthropic, Google).

[JSR]: https://jsr.io/@vertana/cli
[JSR badge]: https://jsr.io/badges/@vertana/cli
[npm]: https://www.npmjs.com/package/@vertana/cli
[npm badge]: https://img.shields.io/npm/v/@vertana/cli?logo=npm
[Vertana]: https://vertana.org/


Installation
------------

~~~~ bash
deno install -g --name vertana --allow-all jsr:@vertana/cli
npm  install -g @vertana/cli
pnpm add     -g @vertana/cli
bun  add     -g @vertana/cli
~~~~


Quick start
-----------

First, configure your API key and default model:

~~~~ bash
vertana config api-key openai
vertana config model openai:gpt-4o
~~~~

Then translate a file:

~~~~ bash
vertana translate -t ko document.md
~~~~

Or pipe text through stdin:

~~~~ bash
echo "Hello, world!" | vertana translate -t ko
~~~~


Commands
--------

### translate

Translate text or files to a target language.

~~~~ bash
vertana translate [options] [input]
~~~~

Options:

 -  `-t, --target LANG`: Target language (required)
 -  `-s, --source LANG`: Source language (optional, auto-detected)
 -  `-T, --type TYPE`: Media type (`text/plain`, `text/markdown`, `text/html`)
 -  `--tone TONE`: Translation tone (formal, informal, technical, etc.)
 -  `--domain DOMAIN`: Subject domain for terminology
 -  `-g, --glossary TERM=TRANS`: Add glossary entry (repeatable)
 -  `--glossary-file FILE`: Load glossary from file
 -  `-o, --output FILE`: Output file (defaults to stdout)


### config

Manage configuration settings.

~~~~ bash
vertana config model [PROVIDER:MODEL]  # Set or display default model
vertana config api-key PROVIDER [KEY]  # Manage API keys
~~~~

Supported providers: `openai`, `anthropic`, `google`


For more resources, see the [docs].

[docs]: https://vertana.org/
