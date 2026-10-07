# EcoTrace

EcoTrace is an environmental-claim stress-testing engine. It discovers sustainability claims, retrieves evidence across multiple search surfaces, normalizes and clusters sources, classifies evidence, and presents the result as an auditable claim register, evidence graph, timeline, and search trace.

The product is intentionally an evidence review tool—not a legal, scientific, or regulatory certification system.

## What it does

An audit follows this pipeline:

```text
Company or claim
  → entity resolution
  → claim discovery
  → deterministic claim decomposition
  → bounded query planning
  → SerpApi retrieval and cache
  → URL/source normalization
  → local relevance ranking and clustering
  → compact batched LLM classification
  → deterministic scoring
  → audit UI, graph, timeline, and export
```

The core design rule is: **SerpApi retrieves, code filters and scores, the LLM reasons about supplied evidence.**

## Repository layout

```text
backend/   Express API, audit orchestration, SerpApi, LLM, cache, scoring, persistence
frontend/  React/Vite application and audit visualizations
shared/    Shared TypeScript models and API contracts
```

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (optional for local mock mode, required for persistence)
- SerpApi key for live searches
- Groq-compatible API key for GPT-OSS analysis; the configured default is `openai/gpt-oss-120b`

## Quick start

```powershell
npm install
Copy-Item backend/.env.example backend/.env
```

For a local UI/API smoke test, set `SERPAPI_MOCK_MODE=true`. Mock mode uses the checked-in demo fixtures and does not call SerpApi.

Start PostgreSQL if persistence is needed:

```powershell
docker compose up -d postgres
npm run db:migrate
```

Run the application:

```powershell
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:5000`
- Health: `http://localhost:5000/api/health`

## Environment configuration

All secrets belong in `backend/.env`; never put them in frontend variables or commit them.

| Variable | Purpose | Default |
| --- | --- | --- |
| `SERPAPI_KEY` | Live SerpApi credential | empty |
| `SERPAPI_BASE_URL` | SerpApi endpoint | `https://serpapi.com/search.json` |
| `SERPAPI_MOCK_MODE` | Use local fixture responses | `false` |
| `GROQ_API_KEY` | LLM credential | empty |
| `GROQ_BASE_URL` | OpenAI-compatible Groq endpoint | `https://api.groq.com/openai/v1` |
| `GROQ_MODEL` | LLM model | `llama-3.3-70b-versatile` |
| `LLM_MAX_INPUT_PER_REQUEST` | Hard estimated input-token ceiling | `3500` |
| `LLM_MAX_SIMPLE_CALLS` | Quick-audit LLM call ceiling | `3` |
| `LLM_MAX_DEEP_CALLS` | Deep-audit LLM call ceiling | `4` |
| `LLM_TPM_LIMIT` | Estimated input-token per-minute ceiling | `8000` |
| `SIMPLE_AUDIT_MAX_SEARCHES` | Quick SerpApi hard maximum | `8` |
| `DEEP_AUDIT_MAX_SEARCHES` | Deep SerpApi hard maximum | `16` |
| `CACHE_TTL_HOURS` | Search cache lifetime | `24` |

## API surface

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | API and mock-mode status |
| `GET` | `/api/health/serpapi` | SerpApi connectivity/configuration check |
| `GET` | `/api/audits/estimate?mode=quick\|deep` | Credit estimate |
| `POST` | `/api/audits` | Start an audit with `{ "company": "Nike", "mode": "quick" }` |
| `GET` | `/api/audits/:id` | Audit detail, claims, evidence, metrics, and credits |
| `GET` | `/api/audits/:id/status` | Progress and engine states |
| `GET` | `/api/audits/:id/graph` | Evidence graph nodes and relationships |
| `GET` | `/api/audits/:id/timeline` | Claim evolution events |
| `GET` | `/api/audits/:id/search-trace` | Search requests and normalized outcomes |
| `GET` | `/api/audits/:id/evidence` | Evidence ledger |
| `GET` | `/api/audits/:id/export` | Markdown export |
| `GET` | `/api/claims/:id` | Claim detail and related evidence |

## Search and reliability behavior

Search budgets are enforced by `CreditManager` and are never bypassed. Cache hits do not consume a live search slot. Queries are normalized before the gateway sends them. Search outcomes are normalized into product-safe states such as `success`, `cached`, `no_results`, `invalid_query`, `timeout`, `provider_error`, `rate_limited`, and `auth_error`.

An individual failed search does not fabricate evidence or automatically fail the audit. The orchestrator continues with the evidence that was successfully retrieved and marks the audit partial only when an engine has no usable result after its planned work.

## LLM safety and cost controls

The LLM receives compact evidence fields, not raw SerpApi JSON. Evidence is locally ranked, deduplicated by canonical URL, and truncated before classification. Relation classification is batched across evidence items instead of using one call per item. Deterministic operations—URL normalization, sorting, duplicate detection, budget checks, source extraction, and score arithmetic—remain in TypeScript.

The hard LLM controls are enforced before network I/O. A prompt over `LLM_MAX_INPUT_PER_REQUEST` or `LLM_TPM_LIMIT` is rejected and never sent. Calls are limited per audit mode, token usage is estimated, and a 429 receives at most one bounded retry.

See [docs/LLM.md](docs/LLM.md) for the detailed contract and operational guidance.

## Development commands

```powershell
npm run dev             # backend and frontend together
npm run build           # shared, backend, and frontend builds
npm test                # backend and frontend tests
npm run lint            # lint all workspaces
npm run typecheck       # typecheck all workspaces
npm run db:migrate      # apply backend database schema
```

Before a live audit, run the mock/unit suites. For a controlled live check, run one quick audit and record search usage, cache hits, LLM usage, evidence count, classifications, and scoring.

## Troubleshooting

- **Audit does not start:** check `/api/health`, `SERPAPI_KEY`, `SERPAPI_BASE_URL`, and PostgreSQL connectivity.
- **No live searches:** `SERPAPI_MOCK_MODE` may still be `true`.
- **LLM fallback behavior:** an absent key, malformed JSON, oversized prompt, or exhausted LLM budget causes deterministic fallback where available.
- **Provider errors:** inspect safe `serpapi_engine_failed` logs; raw keys and authorization headers are redacted.
- **Stale results:** clear the database cache or lower `CACHE_TTL_HOURS` in a development environment.

## Data and limitations

EcoTrace uses publicly available search evidence and automated classification. Search snippets can be incomplete, syndicated, outdated, or context-poor. A supporting or contradicting label is an evidence relationship, not proof of truth or wrongdoing. Review source URLs and the underlying documents before making consequential decisions.
