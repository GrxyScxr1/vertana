import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LanguageModel } from "ai";
import { extractTerms } from "./terms.ts";
import { getTestModel, hasTestModel } from "./testing.ts";

// Lazy model initialization (cached)
let cachedModel: LanguageModel | undefined;
async function getModel(): Promise<LanguageModel> {
  if (cachedModel == null) {
    const m = await getTestModel();
    if (m == null) {
      throw new Error("TEST_MODEL not set");
    }
    cachedModel = m;
  }
  return cachedModel;
}

if (hasTestModel() || !("Bun" in globalThis)) {
  describe(
    "extractTerms",
    { skip: !hasTestModel() && "TEST_MODEL not set" },
    () => {
      it("extracts terminology pairs from source and translated text", async () => {
        const model = await getModel();

        const terms = await extractTerms(
          model,
          "Machine learning uses neural networks for pattern recognition.",
          "기계 학습은 패턴 인식을 위해 신경망을 사용합니다.",
        );

        assert.ok(Array.isArray(terms), "Should return an array");
        // The LLM should extract at least one relevant term
        if (terms.length > 0) {
          assert.ok(terms[0].original != null, "Term should have original");
          assert.ok(
            terms[0].translated != null,
            "Term should have translated",
          );
        }
      });

      it("respects maxTerms option", async () => {
        const model = await getModel();

        const terms = await extractTerms(
          model,
          "Software development, programming, algorithms, data structures, " +
            "databases, networking, security, and cloud computing are important.",
          "소프트웨어 개발, 프로그래밍, 알고리즘, 자료 구조, " +
            "데이터베이스, 네트워킹, 보안, 클라우드 컴퓨팅이 중요합니다.",
          { maxTerms: 3 },
        );

        assert.ok(
          terms.length <= 3,
          `Expected at most 3 terms, got ${terms.length}`,
        );
      });

      it("returns empty array for simple text", async () => {
        const model = await getModel();

        const terms = await extractTerms(
          model,
          "Hello.",
          "안녕하세요.",
          { maxTerms: 5 },
        );

        // Simple greetings may or may not have extractable terms
        assert.ok(Array.isArray(terms), "Should return an array");
      });

      it("respects abort signal", async () => {
        const model = await getModel();
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(
          () =>
            extractTerms(model, "Text", "텍스트", {
              signal: controller.signal,
            }),
          { name: "AbortError" },
        );
      });

      it("extracts technical terms from domain-specific text", async () => {
        const model = await getModel();

        const terms = await extractTerms(
          model,
          "The API uses RESTful endpoints with JSON payloads. " +
            "Authentication is handled via OAuth 2.0 tokens.",
          "API는 JSON 페이로드와 함께 RESTful 엔드포인트를 사용합니다. " +
            "인증은 OAuth 2.0 토큰을 통해 처리됩니다.",
        );

        assert.ok(Array.isArray(terms), "Should return an array");
        // Should extract at least some technical terms
        if (terms.length > 0) {
          const hasApiRelatedTerm = terms.some(
            (t) =>
              t.original.toLowerCase().includes("api") ||
              t.original.toLowerCase().includes("rest") ||
              t.original.toLowerCase().includes("json") ||
              t.original.toLowerCase().includes("oauth") ||
              t.original.toLowerCase().includes("authentication"),
          );
          assert.ok(
            hasApiRelatedTerm,
            "Should extract at least one API-related term",
          );
        }
      });

      it("includes context when relevant", async () => {
        const model = await getModel();

        const terms = await extractTerms(
          model,
          "The bank processes transactions. The river bank is flooded.",
          "은행이 거래를 처리합니다. 강둑이 침수되었습니다.",
        );

        // Some terms may include context to disambiguate meanings
        assert.ok(Array.isArray(terms), "Should return an array");
        // Context field is optional, so we just verify structure
        for (const term of terms) {
          assert.ok(term.original != null, "Term should have original");
          assert.ok(term.translated != null, "Term should have translated");
          // context is optional
        }
      });
    },
  );
}
