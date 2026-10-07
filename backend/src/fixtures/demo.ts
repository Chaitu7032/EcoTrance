import type { SerpApiResponse } from "../serpapi/SerpApiTypes.js";

/** Fixture responses used only when SERPAPI_MOCK_MODE=true. Never mixed with live SerpApi results. */
export const DEMO_COMPANY = "Demo Corporation";

export function mockResponse(engine: SerpApiResponse["engine"], query: string): SerpApiResponse {
  const q = query.toLowerCase();
  if (engine === "google") {
    return wrap(engine, query, [
      {
        title: "Demo Corporation Sustainability Report",
        url: "https://demo.example/sustainability",
        snippet:
          "Demo Corporation uses 100% recycled materials in selected products and targets net-zero emissions by 2040. We reduced emissions by 40% versus a 2018 baseline.",
        sourceName: "Demo Corporation",
        publishedAt: "2025-03-01",
      },
      {
        title: "Independent analysis of Demo Corporation recycled claims",
        url: "https://investigations.example/demo-recycled",
        snippet:
          "Independent product testing found selected Demo apparel labeled 100% recycled polyester contained approximately 70% recycled content.",
        sourceName: "Investigations Desk",
        publishedAt: "2025-11-02",
      },
      {
        title: "Demo Corporation renewable energy FAQ",
        url: "https://demo.example/energy",
        snippet: "We use renewable energy at our owned offices. Supplier manufacturing energy mix is not fully disclosed.",
        sourceName: "Demo Corporation",
        publishedAt: "2024-08-12",
      },
      {
        title: "Yahoo Finance syndicated Demo press release",
        url: "https://finance.yahoo.example/demo-green",
        snippet:
          "Demo Corporation uses 100% recycled materials in selected products and targets net-zero emissions by 2040.",
        sourceName: "Yahoo Finance",
        publishedAt: "2025-03-01",
      },
    ]);
  }
  if (engine === "google_news") {
    return wrap(engine, query, [
      {
        title: "Demo Corporation expands recycled polyester line",
        url: "https://news.example/demo-recycled-line",
        snippet: "The company announced expanded recycled polyester products while critics questioned percentage claims.",
        sourceName: "Retail News",
        publishedAt: "2026-01-14",
      },
      {
        title: "Regulators ask Demo Corporation for emissions methodology",
        url: "https://news.example/demo-emissions-probe",
        snippet: "Questions remain about the 40% emissions reduction baseline and third-party verification.",
        sourceName: "Policy Watch",
        publishedAt: "2025-09-20",
      },
    ]);
  }
  if (engine === "google_scholar") {
    return wrap(engine, query, [
      {
        title: "Life-cycle assessment of recycled polyester textiles",
        url: "https://scholar.example/recycled-polyester-lca",
        snippet:
          "Recycled polyester can reduce some production impacts versus virgin polyester, but benefits depend on feedstock, recycling efficiency, and microplastic shedding.",
        sourceName: "Journal of Industrial Ecology",
        publishedAt: "2023-01-01",
      },
    ]);
  }
  if (engine === "google_shopping") {
    return wrap(engine, query, [
      {
        title: "Demo Run Tee — recycled polyester blend",
        url: "https://shop.example/demo-run-tee",
        snippet: "Material: 70% recycled polyester, 30% virgin polyester. Eco-friendly packaging.",
        sourceName: "ShopExample",
        publishedAt: null,
      },
      {
        title: "Demo Run Tee — 100% recycled claim on listing title",
        url: "https://demo.example/shop/run-tee",
        snippet: "100% recycled materials. Official Demo store.",
        sourceName: "Demo Store",
        publishedAt: null,
      },
    ]);
  }
  return wrap(engine, query, [
    {
      title: `Public search interest: ${query}`,
      url: "https://trends.google.com/trends/explore?q=demo+sustainability",
      snippet: q.includes("greenwash")
        ? "Search interest in Demo greenwashing spiked in late 2025. This is public search interest, not proof of wrongdoing."
        : "Search interest in Demo sustainability is stable with a modest 2025 spike.",
      sourceName: "Google Trends",
      publishedAt: null,
    },
  ]);
}

function wrap(
  engine: SerpApiResponse["engine"],
  query: string,
  hits: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceName: string;
    publishedAt: string | null;
  }>,
): SerpApiResponse {
  return {
    engine,
    query,
    raw: { mock: true, hits },
    hits: hits.map((h) => ({ ...h, metadata: { mock: true } })),
    resultCount: hits.length,
    error: null,
  };
}
