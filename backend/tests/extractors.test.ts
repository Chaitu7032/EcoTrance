import { describe, expect, it } from "vitest";
import { extractGoogleSearchHits } from "../src/serpapi/engines/googleSearch.js";
import { extractGoogleNewsHits } from "../src/serpapi/engines/googleNews.js";
import { extractGoogleScholarHits } from "../src/serpapi/engines/googleScholar.js";
import { extractGoogleShoppingHits } from "../src/serpapi/engines/googleShopping.js";

describe("serpapi extractors", () => {
  it("normalizes google organic results", () => {
    const hits = extractGoogleSearchHits({
      organic_results: [{ title: "A", link: "https://a.example", snippet: "s", source: "A" }],
    });
    expect(hits[0].url).toBe("https://a.example");
  });

  it("normalizes news, scholar, shopping", () => {
    expect(
      extractGoogleNewsHits({
        news_results: [{ title: "N", link: "https://n.example", source: { name: "R" }, iso_date: "2026-01-01" }],
      }),
    ).toHaveLength(1);
    expect(
      extractGoogleScholarHits({
        organic_results: [
          { title: "S", link: "https://s.example", snippet: "lca", publication_info: { summary: "2022 Journal" } },
        ],
      }),
    ).toHaveLength(1);
    expect(
      extractGoogleShoppingHits({
        shopping_results: [{ title: "Tee", product_link: "https://p.example", source: "Store", extensions: ["recycled"] }],
      }),
    ).toHaveLength(1);
  });
});
