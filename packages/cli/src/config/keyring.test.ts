import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskApiKey } from "./keyring.ts";

describe("maskApiKey()", () => {
  it("should mask a long API key", () => {
    const masked = maskApiKey("sk-1234567890abcdef");
    assert.equal(masked, "sk-...cdef");
  });

  it("should mask a key with minimum visible characters", () => {
    const masked = maskApiKey("abcdefghij");
    assert.equal(masked, "abc...ghij");
  });

  it("should return **** for very short keys", () => {
    const masked = maskApiKey("short");
    assert.equal(masked, "****");
  });

  it("should return **** for keys with exactly 8 characters", () => {
    const masked = maskApiKey("12345678");
    assert.equal(masked, "****");
  });
});
