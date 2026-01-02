import { describe, it } from "./test-compat.ts";
import assert from "node:assert/strict";
import { keep, properNoun } from "./glossary.ts";

describe("keep", () => {
  it("creates a glossary entry with same original and translated", () => {
    const entry = keep("React");
    assert.equal(entry.original, "React");
    assert.equal(entry.translated, "React");
    assert.equal(entry.context, undefined);
  });

  it("accepts context option", () => {
    const entry = keep("hook", { context: "React programming concept" });
    assert.equal(entry.original, "hook");
    assert.equal(entry.translated, "hook");
    assert.equal(entry.context, "React programming concept");
  });
});

describe("properNoun", () => {
  it("is an alias for keep", () => {
    assert.strictEqual(properNoun, keep);
  });

  it("creates a glossary entry with same original and translated", () => {
    const entry = properNoun("TypeScript");
    assert.equal(entry.original, "TypeScript");
    assert.equal(entry.translated, "TypeScript");
  });
});
