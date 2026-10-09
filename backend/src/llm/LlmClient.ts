import { z } from "zod";
import { env } from "../config/env.js";
import { logger, sanitizeForLog } from "../utils/logger.js";
import { validateClaimCandidate } from "../analysis/claimValidator.js";

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
Determine which parts of the claim the source supports, contradicts, or leaves unverified. Be extremely conservative: if the source does not explicitly support the specific quantity, date, or scope in the claim, classify it as INSUFFICIENT or PARTIALLY_SUPPORTING. Do not fabricate passages, URLs, dates, or conclusions.

Claim: ${input.claim}
Evidence title: ${input.title}
Evidence snippet: ${input.snippet}
Source type: ${input.sourceType}
Date: ${input.date ?? "unknown"}

Return JSON only:
{"relation":"SUPPORTING|CONTRADICTING|MIXED|IRRELEVANT|INSUFFICIENT","confidence":0-1,"reason":"concise evidence-specific rationale grounded in the source text"}`;
    const parsed = await this.completeJson(prompt);
    const result = relationSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ msg: "llm_malformed_json_rejected", issues: result.error.issues });
      throw new Error("LLM malformed JSON rejected");
    }
    return result.data;
  }

  async extractClaims(company: string, documents: { title: string; snippet: string; url: string; sourceName?: string }[]): Promise<
    z.infer<typeof claimsSchema>["claims"]
  > {
    if (!this.enabled()) return heuristicClaims(company, documents);
    const corpus = documents
      .slice(0, 18)
      .map((d, i) => `${i + 1}. ${d.title}\n${d.snippet}\n${d.url}`)
      .join("\n\n");
    const prompt = `${SAFETY}

Extract specific, testable environmental or sustainability claims attributed to ${company} from the supplied search snippets only.
Do NOT extract questions, article titles, navigation links, slogans, or incomplete allegations.
Every claim must have a testable proposition (e.g. emissions target, recycled content percentage, renewable energy target, or specific allegation).

${corpus}

Return JSON:
{"claims":[{"text":"...","category":"CARBON|ENERGY|MATERIALS|PACKAGING|WATER|WASTE|RECYCLING|SUPPLY_CHAIN|BIODIVERSITY|CLIMATE|GENERAL_ENVIRONMENT","sourceUrl":"...","sourceName":"...","claimDate":null,"specificity":0-1}]}`;
    const parsed = await this.completeJson(prompt);
    const result = claimsSchema.safeParse(parsed);
    if (!result.success) throw new Error("LLM malformed JSON rejected");
    const { validateClaimCandidate } = await import("../analysis/claimValidator.js");
    const validClaims = result.data.claims
      .map((c) => {
        const v = validateClaimCandidate(c.text, company, c.sourceUrl, c.sourceName);
        if (!v.isValid) return null;
        return {
          ...c,
          text: v.cleanText,
          category: v.category,
          specificity: v.specificityScore,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return validClaims.length ? validClaims : heuristicClaims(company, documents);
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

Write a concise, evidence-specific rationale explaining why the claim received status ${status}. Ground your explanation strictly in the stored source content provided in the observations. Do not use generic explanations. Never fabricate passages, URLs, dates, or conclusions. Do not accuse the company of greenwashing or illegal conduct.

Claim: ${claim}
Observations:\n- ${bullets.join("\n- ")}

Return JSON: {"reason":"concise explanation grounded in the observations"}`;
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
  const conflictWords = /(greenwash|misleading|false|lawsuit|probe|overstat|criticism|criticized|critics?|questioned|questions remain|not actually|failed to|accused)/i;
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
  const found: z.infer<typeof claimsSchema>["claims"] = [];
  const seen = new Set<string>();

  for (const doc of documents) {
    // Split snippet into individual sentences, prioritizing substantive snippet content
    const rawSentences = (doc.snippet || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20);

    // Also include title as a fallback candidate sentence only if snippet has no matches
    const candidates = [...rawSentences, doc.title.trim()];

    for (const candidate of candidates) {
      const validation = validateClaimCandidate(candidate, company, doc.url, doc.sourceName);
      if (!validation.isValid) continue;

      const normKey = validation.cleanText.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(normKey)) continue;
      seen.add(normKey);

      found.push({
        text: validation.cleanText,
        category: validation.category,
        sourceUrl: doc.url,
        sourceName: doc.sourceName ?? null,
        claimDate: null,
        specificity: validation.specificityScore,
      });

      if (found.length >= 8) break;
    }

    if (found.length >= 8) break;
  }

  return found;
}

export function heuristicSubclaims(
  claim: string,
  category: string,
): z.infer<typeof subclaimsSchema>["subclaims"] {
  const cat = category as z.infer<typeof subclaimsSchema>["subclaims"][number]["category"];
  return [
    { text: claim, testQuestion: `Is the core statement supported by independent evidence?`, category: cat },
    { text: claim, testQuestion: `Does evidence specify the products, locations, period, and quantity stated?`, category: cat },
  ];
}

export function parseRelationJson(raw: unknown): RelationClassification {
  const result = relationSchema.safeParse(raw);
  if (!result.success) throw new Error("LLM malformed JSON rejected");
  return result.data;
}
