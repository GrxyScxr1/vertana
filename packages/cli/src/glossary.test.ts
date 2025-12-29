import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { glossaryEntry, mergeGlossaries } from "./glossary.ts";

describe("glossaryEntry()", () => {
  const parser = glossaryEntry();

  it("should parse a valid glossary entry", () => {
    const result = parser.parse("LLM=Large Language Model");
    assert.ok(result.success);
    assert.equal(result.value.original, "LLM");
    assert.equal(result.value.translated, "Large Language Model");
  });

  it("should parse an entry with equals sign in translation", () => {
    const result = parser.parse("formula=a=b+c");
    assert.ok(result.success);
    assert.equal(result.value.original, "formula");
    assert.equal(result.value.translated, "a=b+c");
  });

  it("should fail when no equals sign is present", () => {
    const result = parser.parse("no-equals-sign");
    assert.ok(!result.success);
  });

  it("should fail when term is empty", () => {
    const result = parser.parse("=translation");
    assert.ok(!result.success);
  });

  it("should fail when translation is empty", () => {
    const result = parser.parse("term=");
    assert.ok(!result.success);
  });

  it("should format a glossary entry correctly", () => {
    const formatted = parser.format({
      original: "API",
      translated: "Application Programming Interface",
    });
    assert.equal(formatted, "API=Application Programming Interface");
  });
});

describe("mergeGlossaries()", () => {
  it("should merge multiple glossaries", () => {
    const g1 = [{ original: "A", translated: "a" }];
    const g2 = [{ original: "B", translated: "b" }];
    const merged = mergeGlossaries(g1, g2);
    assert.equal(merged.length, 2);
  });

  it("should give priority to later entries", () => {
    const g1 = [{ original: "A", translated: "first" }];
    const g2 = [{ original: "A", translated: "second" }];
    const merged = mergeGlossaries(g1, g2);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].translated, "second");
  });

  it("should handle empty glossaries", () => {
    const merged = mergeGlossaries([], []);
    assert.equal(merged.length, 0);
  });
});
