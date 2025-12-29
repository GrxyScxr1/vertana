import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isProviderName, providerEnvVars } from "./types.ts";

describe("isProviderName()", () => {
  it("should return true for valid provider names", () => {
    assert.ok(isProviderName("openai"));
    assert.ok(isProviderName("anthropic"));
    assert.ok(isProviderName("google"));
  });

  it("should return false for invalid provider names", () => {
    assert.ok(!isProviderName("unknown"));
    assert.ok(!isProviderName(""));
    assert.ok(!isProviderName("OpenAI")); // case sensitive
  });
});

describe("providerEnvVars", () => {
  it("should have correct environment variable names", () => {
    assert.equal(providerEnvVars.openai, "OPENAI_API_KEY");
    assert.equal(providerEnvVars.anthropic, "ANTHROPIC_API_KEY");
    assert.equal(providerEnvVars.google, "GOOGLE_GENERATIVE_AI_API_KEY");
  });
});
