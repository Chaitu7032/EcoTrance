import { z } from "zod";
import { env } from "../config/env.js";
import { logger, sanitizeForLog } from "../utils/logger.js";
import type { EvidenceRelation } from "@ecotrace/shared";

const SAFETY =
  "Use only supplied evidence. Do not invent facts, sources, dates, or unsupported claims. Distinguish contradiction from insufficient evidence.";

const approxTokens = (text: string) => Math.ceil(text.length / 4);

const relationSchema = z.object({
  relation: z.enum(["SUPPORTING", "CONTRADICTING", "MIXED", "IRRELEVANT", "INSUFFICIENT"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export type RelationClassification = z.infer<typeof relationSchema>;

const batchRelationSchema = z.object({
  results: z.array(z.object({
    evidenceId: z.string(),
    relation: z.enum(["SUPPORTING", "CONTRADICTING", "MIXED", "IRRELEVANT", "INSUFFICIENT"]),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
  })),
});

const claimsSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string(),
      category: z.enum([
        "CARBON",
        "ENERGY",
        "MATERIALS",
        "PACKAGING",
        "WATER",
        "WASTE",
        "RECYCLING",
        "SUPPLY_CHAIN",
        "BIODIVERSITY",
        "CLIMATE",
        "GENERAL_ENVIRONMENT",
      ]),
      sourceUrl: z.string().nullable().optional(),
      sourceName: z.string().nullable().optional(),
      claimDate: z.string().nullable().optional(),
      specificity: z.number().min(0).max(1),
    }),
  ),
});

const subclaimsSchema = z.object({
  subclaims: z.array(
    z.object({
      text: z.string(),
      testQuestion: z.string(),
      category: z.enum([
        "CARBON",
        "ENERGY",
        "MATERIALS",
        "PACKAGING",
        "WATER",
        "WASTE",
        "RECYCLING",
        "SUPPLY_CHAIN",
        "BIODIVERSITY",
        "CLIMATE",
        "GENERAL_ENVIRONMENT",
      ]),
    }),
  ),
});

export class LlmClient {
  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private maxCalls = env.LLM_MAX_SIMPLE_CALLS;
  private windowStartedAt = Date.now();
  private windowTokens = 0;
  enabled(): boolean {
    return Boolean(env.GROQ_API_KEY);
  }

  usage() { return { calls: this.calls, estimatedInputTokens: this.inputTokens, estimatedOutputTokens: this.outputTokens }; }

  setAuditMode(mode: "quick" | "deep"): void {
    this.maxCalls = mode === "deep" ? env.LLM_MAX_DEEP_CALLS : env.LLM_MAX_SIMPLE_CALLS;
    this.calls = 0;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.windowStartedAt = Date.now();
    this.windowTokens = 0;
  }

  async classifyRelations(inputs: Array<{ evidenceId: string; claim: string; title: string; snippet: string; sourceType: string; date: string | null }>): Promise<Map<string, RelationClassification>> {
    if (!this.enabled()) return new Map(inputs.map((i) => [i.evidenceId, heuristicRelation(i)]));
    const compact = inputs.map((i) => `ID:${i.evidenceId}\nClaim:${i.claim}\nTitle:${i.title}\nSource:${i.sourceType}\nDate:${i.date ?? "unknown"}\nText:${i.snippet.slice(0, 350)}`).join("\n\n");
    const prompt = `${SAFETY}\nClassify every supplied evidence item for its claim. Return JSON only, with no omitted IDs:\n${compact}\n{"results":[{"evidenceId":"E1","relation":"SUPPORTING|CONTRADICTING|MIXED|IRRELEVANT|INSUFFICIENT","confidence":0-1,"reason":"short reason"}]}`;
    const parsed = batchRelationSchema.safeParse(await this.completeJson(prompt));
    if (!parsed.success) throw new Error("LLM malformed JSON rejected");
    return new Map(parsed.data.results.map((r) => [r.evidenceId, { relation: r.relation, confidence: r.confidence, reason: r.reason }]));
  }

  async classifyRelation(input: {
    claim: string;
    title: string;
    snippet: string;
    sourceType: string;
    date: string | null;
  }): Promise<RelationClassification> {
    if (!this.enabled()) return heuristicRelation(input);
    const prompt = `${SAFETY}

Classify the relationship between the claim and the retrieved source. Use only the supplied text.

Claim: ${input.claim}
Evidence title: ${input.title}
Evidence snippet: ${input.snippet}
Source type: ${input.sourceType}
Date: ${input.date ?? "unknown"}

Return JSON only:
{"relation":"SUPPORTING|CONTRADICTING|MIXED|IRRELEVANT|INSUFFICIENT","confidence":0-1,"reason":"..."}`;
    const parsed = await this.completeJson(prompt);
    const result = relationSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ msg: "llm_malformed_json_rejected", issues: result.error.issues });
      throw new Error("LLM malformed JSON rejected");
    }
    return result.data;
  }

  async extractClaims(company: string, documents: { title: string; snippet: string; url: string }[]): Promise<
    z.infer<typeof claimsSchema>["claims"]
  > {
    if (!this.enabled()) return heuristicClaims(company, documents);
    const corpus = documents
      .slice(0, 18)
      .map((d, i) => `${i + 1}. ${d.title}\n${d.snippet}\n${d.url}`)
      .join("\n\n");
    const prompt = `${SAFETY}

Extract environmental or sustainability claims attributed to ${company} from the supplied search snippets only. Do not invent claims that are not suggested by the snippets.

${corpus}

Return JSON:
{"claims":[{"text":"...","category":"CARBON|ENERGY|MATERIALS|PACKAGING|WATER|WASTE|RECYCLING|SUPPLY_CHAIN|BIODIVERSITY|CLIMATE|GENERAL_ENVIRONMENT","sourceUrl":"...","sourceName":"...","claimDate":null,"specificity":0-1}]}`;
    const parsed = await this.completeJson(prompt);
    const result = claimsSchema.safeParse(parsed);
    if (!result.success) throw new Error("LLM malformed JSON rejected");
    return result.data.claims;
  }

  async decomposeClaim(claim: string, category: string): Promise<z.infer<typeof subclaimsSchema>["subclaims"]> {
    if (!this.enabled()) return heuristicSubclaims(claim, category);
    const prompt = `${SAFETY}

Break this environmental claim into atomic, independently testable subclaims. Do not add facts not present in the claim; you may add test questions that ask what evidence would be required.

Claim: ${claim}
Category: ${category}

Return JSON:
{"subclaims":[{"text":"...","testQuestion":"...","category":"${category}"}]}`;
    const parsed = await this.completeJson(prompt);
    const result = subclaimsSchema.safeParse(parsed);
    if (!result.success) throw new Error("LLM malformed JSON rejected");
    return result.data.subclaims;
  }

  async explain(claim: string, status: string, bullets: string[]): Promise<string> {
    if (!this.enabled()) {
      return `EcoTrace reached ${status} because: ${bullets.join(" ")} This is an evidence assessment, not a finding of wrongdoing.`;
    }
    const prompt = `${SAFETY}

Write a short, careful explanation of why the claim received status ${status}. Use only these evidence observations. Do not accuse the company of greenwashing or illegal conduct.

Claim: ${claim}
Observations:\n- ${bullets.join("\n- ")}

Return JSON: {"reason":"..."}`;
    const parsed = await this.completeJson(prompt);
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.reason !== "string") throw new Error("LLM malformed JSON rejected");
    return rec.reason;
  }

  private async completeJson(prompt: string): Promise<unknown> {
    const promptTokens = approxTokens(prompt);
    if (this.calls >= this.maxCalls) throw new Error("LLM request budget exhausted");
    if (promptTokens > env.LLM_MAX_INPUT_PER_REQUEST) {
      throw new Error(`LLM prompt exceeds configured input budget (${promptTokens} > ${env.LLM_MAX_INPUT_PER_REQUEST})`);
    }
    if (promptTokens > env.LLM_TPM_LIMIT) {
      throw new Error(`LLM prompt exceeds configured TPM budget (${promptTokens} > ${env.LLM_TPM_LIMIT})`);
    }
    await this.reserveTpm(promptTokens);
    this.calls += 1;
    this.inputTokens += promptTokens;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const endpoint = `${env.GROQ_BASE_URL.replace(/\/$/, "")}/chat/completions`;
      const endpointUrl = new URL(endpoint);
      logger.debug({
        msg: "llm_request_config",
        provider: "groq",
        model: env.GROQ_MODEL,
        hostname: endpointUrl.hostname,
        path: endpointUrl.pathname,
        method: "POST",
      });
      let res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.GROQ_MODEL,
          messages: [
            { role: "system", content: SAFETY },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      let body = (await res.json()) as Record<string, unknown>;
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 1);
        await new Promise((resolve) => setTimeout(resolve, Math.min(5000, Math.max(250, retryAfter * 1000))));
        res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: JSON.stringify({ model: env.GROQ_MODEL, messages: [{ role: "system", content: SAFETY }, { role: "user", content: prompt }], temperature: 0.1, response_format: { type: "json_object" } }), signal: controller.signal });
        body = (await res.json()) as Record<string, unknown>;
      }
      if (!res.ok) {
        const errorBody = body.error;
        const errorMessage =
          errorBody && typeof errorBody === "object" && typeof (errorBody as Record<string, unknown>).message === "string"
            ? (errorBody as Record<string, unknown>).message
            : typeof body.message === "string"
              ? body.message
              : "Gemini request failed";
        logger.warn({
          msg: "llm_http_error",
          provider: "groq",
          model: env.GROQ_MODEL,
          endpointPath: endpointUrl.pathname,
          status: res.status,
          errorMessage: sanitizeForLog(errorMessage),
        });
        if (res.status === 404) {
          throw new Error(`Groq model endpoint returned HTTP 404. Check GROQ_MODEL (${env.GROQ_MODEL}) and Groq API endpoint configuration.`);
        }
        throw new Error(`Groq request failed with HTTP ${res.status}: ${sanitizeForLog(errorMessage)}`);
      }
      const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
      const content = choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM malformed JSON rejected");
      this.outputTokens += approxTokens(content);
      return JSON.parse(content);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new Error("LLM timeout");
      logger.warn({ msg: "llm_error", error: sanitizeForLog(String(err)) });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async reserveTpm(promptTokens: number): Promise<void> {
    const now = Date.now();
    if (now - this.windowStartedAt >= 60_000) {
      this.windowStartedAt = now;
      this.windowTokens = 0;
    }
    if (this.windowTokens + promptTokens > env.LLM_TPM_LIMIT) {
      const waitMs = Math.max(0, 60_000 - (now - this.windowStartedAt));
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.windowStartedAt = Date.now();
      this.windowTokens = 0;
    }
    this.windowTokens += promptTokens;
  }
}

export function heuristicRelation(input: {
  claim: string;
  title: string;
  snippet: string;
  sourceType: string;
}): RelationClassification {
  const text = `${input.title} ${input.snippet}`.toLowerCase();
  const claim = input.claim.toLowerCase();
  const conflictWords = /(greenwash|misleading|false|lawsuit|probe|overstat|criticism|not actually|failed to|accused)/i;
  const supportWords = /(achiev|certified|verified|uses recycled|renewable|reduced|net-zero|report)/i;
  const overlap = claim
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .filter((w) => text.includes(w)).length;

  if (overlap < 1 && !/(sustainab|environment|recycl|carbon|climate)/.test(text)) {
    return { relation: "IRRELEVANT", confidence: 0.55, reason: "Snippet does not overlap with the claim language." };
  }
  if (conflictWords.test(text) && supportWords.test(text)) {
    return { relation: "MIXED", confidence: 0.5, reason: "Source contains both supportive language and criticism." };
  }
  if (conflictWords.test(text)) {
    return { relation: "CONTRADICTING", confidence: 0.55, reason: "Source language challenges or criticizes the claim." };
  }
  if (supportWords.test(text) || overlap >= 2) {
    return { relation: "SUPPORTING", confidence: 0.5, reason: "Source language aligns with the claim using retrieved wording." };
  }
  return { relation: "INSUFFICIENT", confidence: 0.4, reason: "Retrieved snippet is too thin to classify confidently." };
}

export function heuristicClaims(
  company: string,
  documents: { title: string; snippet: string; url: string; sourceName?: string }[],
): z.infer<typeof claimsSchema>["claims"] {
  const patterns: { re: RegExp; category: z.infer<typeof claimsSchema>["claims"][number]["category"] }[] = [
    { re: /carbon neutral|net[- ]?zero|emissions/i, category: "CARBON" },
    { re: /renewable energy|100% renewable|clean energy/i, category: "ENERGY" },
    { re: /recycled (polyester|material|content)|recycl/i, category: "RECYCLING" },
    { re: /packaging/i, category: "PACKAGING" },
    { re: /water/i, category: "WATER" },
    { re: /waste/i, category: "WASTE" },
    { re: /supply chain/i, category: "SUPPLY_CHAIN" },
    { re: /biodivers/i, category: "BIODIVERSITY" },
    { re: /climate/i, category: "CLIMATE" },
    { re: /sustainab|environment/i, category: "GENERAL_ENVIRONMENT" },
  ];
  const found: z.infer<typeof claimsSchema>["claims"] = [];
  const seen = new Set<string>();
  for (const doc of documents) {
    const blob = `${doc.title}. ${doc.snippet}`;
    for (const p of patterns) {
      if (!p.re.test(blob)) continue;
      const sentence =
        blob.match(/[^.?!]*(?:sustainab|recycl|carbon|renewable|emission|packag|net-zero|environment)[^.?!]*[.?!]/i)?.[0] ??
        blob.slice(0, 180);
      const text = sentence.replace(/\s+/g, " ").trim();
      const key = text.toLowerCase();
      if (seen.has(key) || text.length < 24) continue;
      seen.add(key);
      const specificity = /\d+%|\d{4}|certified|verified/.test(text) ? 0.7 : 0.35;
      found.push({
        text: `${company}: ${text}`,
        category: p.category,
        sourceUrl: doc.url,
        sourceName: doc.sourceName ?? null,
        claimDate: null,
        specificity,
      });
    }
  }
  return found.slice(0, 8);
}

export function heuristicSubclaims(
  claim: string,
  category: string,
): z.infer<typeof subclaimsSchema>["subclaims"] {
  const cat = category as z.infer<typeof subclaimsSchema>["subclaims"][number]["category"];
  return [
    { text: claim, testQuestion: `Is the core statement supported by independent evidence?`, category: cat },
    {
      text: `The claim is specific about products, geography, or time period.`,
      testQuestion: `Does evidence specify products, locations, and reporting period?`,
      category: cat,
    },
    {
      text: `A measurable quantity (percentage, volume, or certified share) is disclosed.`,
      testQuestion: `Is a measurable quantity disclosed and consistent across sources?`,
      category: cat,
    },
    {
      text: `The environmental impact is lower than a stated alternative or baseline.`,
      testQuestion: `Is a baseline or alternative comparison present in the evidence?`,
      category: cat,
    },
    {
      text: `Independent or scientific sources address the underlying proposition.`,
      testQuestion: `Does non-company evidence speak to the scientific or product-level proposition?`,
      category: cat,
    },
  ];
}

export function parseRelationJson(raw: unknown): RelationClassification {
  const result = relationSchema.safeParse(raw);
  if (!result.success) throw new Error("LLM malformed JSON rejected");
  return result.data;
}
