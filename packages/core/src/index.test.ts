import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  Chunker,
  ContextSource,
  ContextWindow,
  Glossary,
  TranslationEvaluator,
} from "./index.ts";

describe("@vertana/core", () => {
  it("exports types correctly", () => {
    // Type-level test: these assignments verify that the types are exported
    // and can be used. The actual values are just placeholders.
    const _contextSource: ContextSource | undefined = undefined;
    const _chunker: Chunker | undefined = undefined;
    const _glossary: Glossary | undefined = undefined;
    const _contextWindow: ContextWindow | undefined = undefined;
    const _evaluator: TranslationEvaluator | undefined = undefined;

    // Suppress unused variable warnings
    void _contextSource;
    void _chunker;
    void _glossary;
    void _contextWindow;
    void _evaluator;

    assert.ok(true);
  });
});
