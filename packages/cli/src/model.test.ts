import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelCode, parseModelCode } from "./model.ts";

describe("parseModelCode()", () => {
  it("should parse openai model code", () => {
    const result = parseModelCode("openai:gpt-4o");
    assert.equal(result.provider, "openai");
    assert.equal(result.modelId, "gpt-4o");
  });

  it("should parse anthropic model code", () => {
    const result = parseModelCode("anthropic:claude-3-5-sonnet-20241022");
    assert.equal(result.provider, "anthropic");
    assert.equal(result.modelId, "claude-3-5-sonnet-20241022");
  });

  it("should parse google model code", () => {
    const result = parseModelCode("google:gemini-1.5-flash");
    assert.equal(result.provider, "google");
    assert.equal(result.modelId, "gemini-1.5-flash");
  });

  it("should throw SyntaxError when no colon is present", () => {
    assert.throws(
      () => parseModelCode("openai-gpt-4o"),
      SyntaxError,
    );
  });

  it("should throw SyntaxError when model ID is empty", () => {
    assert.throws(
      () => parseModelCode("openai:"),
      SyntaxError,
    );
  });

  it("should throw TypeError for unsupported provider", () => {
    assert.throws(
      () => parseModelCode("unknown:model"),
      TypeError,
    );
  });
});

describe("modelCode() ValueParser", () => {
  const parser = modelCode();

  it("should parse valid model code", () => {
    const result = parser.parse("openai:gpt-4o");
    assert.ok(result.success);
    if (result.success) {
      assert.equal(result.value.provider, "openai");
      assert.equal(result.value.modelId, "gpt-4o");
    }
  });

  it("should return error when no colon is present", () => {
    const result = parser.parse("openai-gpt-4o");
    assert.ok(!result.success);
  });

  it("should return error when model ID is empty", () => {
    const result = parser.parse("openai:");
    assert.ok(!result.success);
  });

  it("should return error for unsupported provider", () => {
    const result = parser.parse("unknown:model");
    assert.ok(!result.success);
  });

  it("should format model code correctly", () => {
    const formatted = parser.format({
      provider: "anthropic",
      modelId: "claude-3-5-sonnet-20241022",
    });
    assert.equal(formatted, "anthropic:claude-3-5-sonnet-20241022");
  });
});
