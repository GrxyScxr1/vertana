import { describe, it } from "./test-compat.ts";
import assert from "node:assert/strict";
import { countTokens, createDefaultTokenCounter } from "./tokens.ts";

describe("countTokens", () => {
  it("counts tokens in a simple string", () => {
    const tokens = countTokens("Hello, world!");
    assert.ok(tokens > 0);
    assert.ok(typeof tokens === "number");
  });

  it("returns 0 for empty string", () => {
    const tokens = countTokens("");
    assert.equal(tokens, 0);
  });

  it("counts tokens consistently for the same input", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    const first = countTokens(text);
    const second = countTokens(text);
    assert.equal(first, second);
  });

  it("counts more tokens for longer text", () => {
    const short = "Hello";
    const long = "Hello, this is a much longer sentence with more words.";
    assert.ok(countTokens(long) > countTokens(short));
  });
});

describe("createDefaultTokenCounter", () => {
  it("returns a function", () => {
    const counter = createDefaultTokenCounter();
    assert.ok(typeof counter === "function");
  });

  it("returns the same results as countTokens", () => {
    const counter = createDefaultTokenCounter();
    const text = "Testing the token counter.";
    assert.equal(counter(text), countTokens(text));
  });
});
