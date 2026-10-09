# EcoTrace LLM operations guide

## Purpose

EcoTrace uses a Groq-compatible OpenAI API for semantic tasks only. The current client is `backend/src/llm/LlmClient.ts`; the audit orchestrator is `backend/src/services/AuditOrchestrator.ts`.

The LLM is not used for URL handling, search budgeting, pagination, date sorting, duplicate detection, source-domain extraction, or numerical scoring.

## Current call contract

### Claim discovery

`extractClaims()` receives compact title/snippet/URL records from discovery searches and returns structured claim records validated with Zod. Claims are retained in the audit store.

### Subclaim decomposition

The orchestrator currently uses deterministic `heuristicSubclaims()` for query scaffolding. This avoids spending a separate LLM request on every claim and keeps the search budget predictable.

### Batched evidence classification

`classifyRelations()` sends all selected evidence items in one compact request. Each item contains:

```text
evidence ID
claim text
title
source type
publication date
short evidence excerpt
```

The expected JSON shape is:

```json
{
  "results": [
    {
      "evidenceId": "E1",
      "relation": "SUPPORTING",
      "confidence": 0.82,
      "reason": "The supplied excerpt directly supports the claim."
    }
  ]
}
```

Allowed relations are `SUPPORTING`, `CONTRADICTING`, `MIXED`, `IRRELEVANT`, and `INSUFFICIENT`.

## Hard enforcement

Before `fetch()` is called, the client:

1. Estimates input tokens using `ceil(text.length / 4)`.
2. Rejects prompts above `LLM_MAX_INPUT_PER_REQUEST`.
3. Rejects a single prompt above `LLM_TPM_LIMIT`.
4. Waits for the next minute window if the accumulated estimated input would exceed `LLM_TPM_LIMIT`.
5. Rejects calls once the current audit’s simple/deep call ceiling is reached.

Oversized prompts are never sent and are never retried. The orchestrator falls back to deterministic classification where the pipeline supports it.

Usage counters expose estimated calls, input tokens, and output tokens through `LlmClient.usage()` for diagnostics.

## Rate limits and errors

- `429`: waits for `retry-after` when present and retries once only.
- `404`: fails immediately with model/endpoint guidance.
- Other HTTP failures: fail once and use the orchestrator fallback path.
- Timeout: request aborts after the client timeout.
- Invalid JSON: Zod validation rejects the response; it is never treated as evidence.

The client sends a safety instruction requiring the model to use only supplied evidence and not invent facts, sources, dates, or unsupported claims.

## Prompt budget guidance

Keep evidence excerpts short and meaningful. Prefer one complete sentence over a raw response. If a prompt approaches the configured ceiling, reduce evidence items by local relevance and source independence before reducing claim context. Never solve an oversized prompt by silently raising environment limits.

Recommended production starting values for the current GPT-OSS 120B setup:

```env
LLM_MAX_INPUT_PER_REQUEST=3500
LLM_MAX_SIMPLE_CALLS=3
LLM_MAX_DEEP_CALLS=4
LLM_TPM_LIMIT=8000
```

Changing these values changes operational behavior and should be accompanied by mock tests and one controlled live audit.

## Testing checklist

- Oversized input makes zero network calls.
- Input at the limit is allowed.
- Quick audits cannot exceed the simple call ceiling.
- Deep audits cannot exceed the deep call ceiling.
- Accumulated input waits at the TPM boundary.
- 429 retries exactly once.
- 404 and deterministic HTTP failures do not loop.
- Malformed structured output falls back or fails safely.
- Raw API keys and authorization headers never appear in logs.
