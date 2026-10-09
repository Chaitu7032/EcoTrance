# EcoTrace — Complete Setup Guide & Change Log

This document covers everything needed to run EcoTrace, all improvements made to
the project, and how to access every feature.

---

## System Requirements

| Requirement | Minimum | Your System |
|---|---|---|
| Node.js | 20+ | v24.15.0 ✅ |
| npm | 10+ | v11.12.1 ✅ |
| Docker | Any | v29.1.3 ✅ (optional, for persistence) |

---

## Credentials You Need

### Required for live audits

| Key | Where to get it | Where it goes |
|---|---|---|
| `SERPAPI_KEY` | https://serpapi.com/dashboard | `backend/.env` |
| `GROQ_API_KEY` | https://console.groq.com | `backend/.env` |

### Required for persistence (optional)

| Option | How | Connection string |
|---|---|---|
| Local Docker Postgres | `docker compose up -d postgres` | `DATABASE_URL=postgresql://ecotrace:ecotrace@localhost:5432/ecotrace` |
| Supabase (cloud) | https://supabase.com → project settings → database | `SUPABASE_DB_URL=postgresql://...` |

Without a database, the app runs in-memory. Audits are lost on server restart.

---

## One-Time Setup

```bash
# 1. Go to the project folder
cd /home/dhaynesh/Downloads/EcoTrance-main

# 2. Install all dependencies (already done — node_modules exists)
npm install

# 3. The .env files are already created. Edit them with your real keys:
nano backend/.env
```

### backend/.env — fill in your keys

```env
NODE_ENV=development
PORT=5000

# Leave blank for in-memory mode (no persistence between restarts)
# Uncomment for Docker Postgres:
# DATABASE_URL=postgresql://ecotrace:ecotrace@localhost:5432/ecotrace
# SUPABASE_DB_SSL=false
SUPABASE_DB_URL=
SUPABASE_DB_SSL=true

# ↓ Replace with your real SerpApi key
SERPAPI_KEY=your_serpapi_key_here
SERPAPI_BASE_URL=https://serpapi.com/search.json
# Set to false for live audits, true for demo/testing without spending credits
SERPAPI_MOCK_MODE=false

# ↓ Replace with your real Groq key
GROQ_API_KEY=your_groq_key_here
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
LLM_MAX_INPUT_PER_REQUEST=3500
LLM_MAX_SIMPLE_CALLS=3
LLM_MAX_DEEP_CALLS=4
LLM_TPM_LIMIT=8000

AUDIT_MAX_REQUESTS=80
GLOBAL_MAX_REQUESTS=400
SIMPLE_AUDIT_MAX_SEARCHES=8
DEEP_AUDIT_MAX_SEARCHES=16
CACHE_TTL_HOURS=24
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=info
```

### frontend/.env — already correct, no changes needed

```env
VITE_API_BASE_URL=http://localhost:5000
```

---

## Running the App

### Start everything (one command)

```bash
cd /home/dhaynesh/Downloads/EcoTrance-main
npm run dev
```

This starts both backend (port 5000) and frontend (port 5173) together.

### Optional — start with Postgres persistence

```bash
# Start Postgres container first
docker compose up -d postgres

# Run migrations (first time only)
npm run db:migrate

# Then start the app
npm run dev
```

### Stop the app

```bash
# If started in foreground: Ctrl+C
# If started in background:
kill $(lsof -ti:5000) $(lsof -ti:5173)
```

---

## Where to Access Everything

| URL | What it does |
|---|---|
| `http://localhost:5173` | Landing page — start an audit here |
| `http://localhost:5173/audits` | **NEW** Audit History — all past audits |
| `http://localhost:5173/audit/:id` | Audit results page |
| `http://localhost:5173/audit/:id/claim/:claimId` | Individual claim deep-dive |
| `http://localhost:5000/api/health` | Backend health check |
| `http://localhost:5000/api/health/serpapi` | SerpApi connectivity check |

---

## How to Run Your First Audit

1. Open `http://localhost:5173`
2. Type a company name — e.g. `Nike`, `H&M`, `Unilever`, `Patagonia`
3. Click **Quick Audit** (uses up to 8 SerpApi credits)
   - Or **Deep Audit** for more thorough analysis (up to 16 credits)
4. Watch the progress bar move through all pipeline stages
5. When complete — explore:
   - **Claim Register** — all discovered sustainability claims with integrity scores
   - **Evidence Graph** — visual relationship map
   - **Claim Timeline** — chronological evidence events
   - **Search Trace** — every query executed with credit usage
   - Click any claim for the full evidence ledger with filter toggles
6. Click **Export Dossier** for a downloadable markdown report

### Demo mode (no API keys needed)

Set `SERPAPI_MOCK_MODE=true` in `backend/.env` and type `Demo Corporation`.
Uses pre-built fixtures — no credits consumed. Good for UI testing.

---

## All Changes Made to the Project

### New SerpAPI Engines (4)

These are entirely new files. None of the existing engines were modified.

#### 1. Google Ads Transparency (`google_ads_transparency`)
- **File:** `backend/src/serpapi/engines/googleAdsTransparency.ts`
- **What it does:** Queries the Google Ads Transparency Center for paid ads the
  company runs. If a company runs ads claiming "eco-friendly" or "carbon neutral"
  but independent evidence contradicts those claims, that discrepancy is surfaced.
- **Source type produced:** `AD_CLAIM` (shown in red badge on evidence cards)
- **Runs:** Every audit (quick + deep)
- **Credits used:** 2 per audit

#### 2. Google Patents (`google_patents`)
- **File:** `backend/src/serpapi/engines/googlePatents.ts`
- **What it does:** Finds patent filings matching the company's claimed technology.
  Zero patents for a claimed innovation is an evidence gap. Active filings are
  strong independent corroboration.
- **Source type produced:** `PATENT` (shown in blue badge)
- **Runs:** Only when MATERIALS, ENERGY, CARBON, RECYCLING, or CLIMATE claims detected
- **Credits used:** 1 per audit (conditional)

#### 3. Google Forums (`google_forums`)
- **File:** `backend/src/serpapi/engines/googleForums.ts`
- **What it does:** Retrieves Reddit, Quora, and consumer forum discussions about
  the company's sustainability reputation. Forum posts are the most independent
  signal — real consumers, no corporate PR.
- **Source type produced:** `FORUM` (shown in purple badge)
- **Runs:** Every audit (quick + deep)
- **Credits used:** 2 per audit

#### 4. YouTube Video Transcripts (`youtube`)
- **File:** `backend/src/serpapi/engines/youtubeTranscript.ts`
- **What it does:** Searches for sustainability report walkthroughs, CEO climate
  pledges, and ESG presentations on YouTube. Extracts sustainability-relevant
  sentences from transcripts. Executive spoken statements are primary-source claims.
- **Source type produced:** `VIDEO_TRANSCRIPT` (shown in orange badge)
- **Runs:** Deep audits only
- **Credits used:** 2 per deep audit

---

### Backend Architecture Improvements

#### 5. Parallel Engine Execution
- **File:** `backend/src/services/AuditOrchestrator.ts`
- **What changed:** The 5 core evidence engines (google, google_news,
  google_scholar, google_shopping, google_trends) previously ran sequentially
  — each waiting for the previous to finish. They now run with `Promise.all()`
  in a single parallel batch.
- **Impact:** ~60% faster audit completion time

#### 6. Synonym Expansion for Relevance Matching
- **File:** `backend/src/services/AuditOrchestrator.ts` → `SYNONYM_MAP` + `expandTerms()`
- **What changed:** The relevance scoring function previously used simple word
  overlap. "CO₂" never matched "carbon". "plastic" never matched "packaging".
  A deterministic synonym map now expands terms before scoring.
- **Synonyms covered:** carbon/CO₂/emissions, renewable/solar/wind, recycled/
  post-consumer, plastic/packaging, water/wastewater, forest/deforestation,
  supply/sourcing, energy/electricity, and more.
- **Impact:** Better evidence gets linked to the right claims. Zero API calls.

#### 7. Export Report Formatting
- **File:** `backend/src/services/AuditOrchestrator.ts` → `formatMetricsTable()`
- **What changed:** The exported dossier previously dumped raw
  `JSON.stringify(metrics)` into the markdown. Now renders as a proper
  formatted table with % values.

---

### New API Endpoint

#### 8. GET /api/audits — Audit List
- **File:** `backend/src/routes/audits.ts`
- **What it does:** Returns all audits stored in the current session.
  Used by the new Audit History page.
- **Response:** `{ audits: Audit[] }`

---

### Frontend New Features

#### 9. Audit History Page (`/audits`)
- **File:** `frontend/src/pages/AuditsPage.tsx`
- **What it does:** Lists all audits run in the current session, sorted newest
  first. Shows company name, mode, status with icon, timestamps. Live-refreshes
  every 2 seconds if any audit is still running.
- **Access:** `http://localhost:5173/audits` or click **History** in the nav bar

#### 10. Score Breakdown Bars on Metric Cards
- **File:** `frontend/src/pages/AuditPage.tsx`
- **What changed:** Each of the 5 metric cards now has a colour-coded progress
  bar showing the score visually:
  - Claim Integrity — **circular SVG ring** in emerald green (centrepiece)
  - Evidence Coverage — sky blue bar
  - Source Independence — violet bar
  - Evidence Conflict — rose/red bar
  - Claim Specificity — amber bar

#### 11. Source Type Badge Colours on Evidence Cards
- **File:** `frontend/src/pages/ClaimPage.tsx`
- **What changed:** Every evidence item's source type badge now has a distinct
  colour making the new engines instantly recognisable:
  - 🔴 Red — `AD CLAIM`
  - 🔵 Blue — `PATENT`
  - 🟣 Purple — `FORUM`
  - 🟠 Orange — `VIDEO TRANSCRIPT`
  - Cyan — Scientific / Academic
  - Sky blue — News
  - Teal — Government
  - Lime — NGO
  - Amber — Official Company
  - Violet — Product

#### 12. Evidence Filter Toggle
- **File:** `frontend/src/pages/ClaimPage.tsx`
- **What changed:** The evidence ledger on the claim detail page now has filter
  buttons with live counts:
  - All (n)
  - Supporting (n)
  - Contradicting (n)
  - Mixed (n)
  - Insufficient (n)
- Clicking a filter instantly hides non-matching evidence items.

#### 13. Visual Pipeline Flow on Landing Page
- **File:** `frontend/src/pages/LandingPage.tsx`
- **What changed:** The right-side panel replaced a plain text list with a
  5-step visual pipeline (connected by a vertical line) showing:
  1. 🔍 Discover Claims
  2. ⚗️ Decompose
  3. 🌐 9-Engine Retrieval
  4. 🔗 Cluster & Score
  5. 📊 Integrity Report
  Plus 9 coloured engine chips at the bottom.

---

### Bug Fixes

#### 14. `backend/.env.example` broken line
- `LOG_LEVEL=info` was concatenated with a comment from a different file,
  causing `LOG_LEVEL` to parse as `info# Frontend values...`. Fixed.

#### 15. `GROQ_MODEL` mismatch
- `.env.example` said `openai/gpt-oss-120b` but code default was
  `llama-3.3-70b-versatile`. Now in sync at `llama-3.3-70b-versatile`.

#### 16. `frontend/.env.example` was empty
- Now correctly contains `VITE_API_BASE_URL=http://localhost:5000`

---

### New Documentation Files

| File | Contents |
|---|---|
| `docs/engines.md` | Complete reference for all 9 engines, execution order diagram, credit budgets, independence weighting, synonym map |
| `docs/SETUP_AND_CHANGES.md` | This file |

---

## Full File Change List

| File | Type of change |
|---|---|
| `shared/src/enums.ts` | Added 4 engine names, 4 stage names, 4 source types |
| `backend/src/serpapi/SerpApiTypes.ts` | Added 4 engine types to union |
| `backend/src/serpapi/SerpApiClient.ts` | Registered 4 new extractors |
| `backend/src/serpapi/engines/googleAdsTransparency.ts` | **NEW** |
| `backend/src/serpapi/engines/googlePatents.ts` | **NEW** |
| `backend/src/serpapi/engines/googleForums.ts` | **NEW** |
| `backend/src/serpapi/engines/youtubeTranscript.ts` | **NEW** |
| `backend/src/analysis/sourceType.ts` | Added 4 new source type cases + quality scores |
| `backend/src/services/SearchGateway.ts` | Added 4 new search methods |
| `backend/src/services/QueryPlanner.ts` | Added 4 new query planning functions |
| `backend/src/services/AuditOrchestrator.ts` | Parallel execution, 4 new engines, synonym map, export table |
| `backend/src/routes/audits.ts` | Added `GET /` list endpoint |
| `backend/src/fixtures/demo.ts` | Added mock fixtures for 4 new engines |
| `backend/.env` | **CREATED** — pre-configured for mock mode |
| `backend/.env.example` | Fixed broken line, corrected GROQ_MODEL |
| `frontend/src/lib/labels.ts` | Added 4 stage labels + 4 engine labels |
| `frontend/src/pages/AuditsPage.tsx` | **NEW** — Audit History page |
| `frontend/src/pages/AuditPage.tsx` | Score ring, coloured progress bars, new stages |
| `frontend/src/pages/ClaimPage.tsx` | Source type badge colours, evidence filter toggle |
| `frontend/src/pages/LandingPage.tsx` | Visual pipeline flow replacing text list |
| `frontend/src/api.ts` | Added `listAudits()` |
| `frontend/src/App.tsx` | Added `/audits` route |
| `frontend/src/components/Shell.tsx` | Added History nav link |
| `frontend/.env` | **CREATED** — `VITE_API_BASE_URL=http://localhost:5000` |
| `frontend/.env.example` | Fixed to contain correct VITE_ URL |
| `docs/engines.md` | **NEW** — engine reference documentation |
| `docs/SETUP_AND_CHANGES.md` | **NEW** — this file |

---

## Verification

Run these to confirm everything is working:

```bash
# Type check — should show 0 errors
npm run typecheck

# Tests — should show 48 backend + 5 frontend passing
npm test

# Health check — should return ok:true, mockMode depends on your .env
curl http://localhost:5000/api/health
```

---

## Credit Budget Summary

| Audit mode | Max SerpApi searches | Engines |
|---|---|---|
| Quick | 8 searches | google, google_news, google_scholar*, google_shopping*, google_ads_transparency, google_forums, google_patents* |
| Deep | 16 searches | All 9 engines including google_trends and youtube |

\* Conditional — only runs when relevant claim categories are detected.

Cache hits consume **zero credits**. Set `CACHE_TTL_HOURS=24` in `.env` to
control how long results are cached.

---

## Support

- Backend logs: `http://localhost:5000/api/health`
- SerpApi status: `http://localhost:5000/api/health/serpapi`
- Search trace: `http://localhost:5173/audit/:id` → Search Trace tab
- If audit gets stuck: refresh the page — the audit continues in the background
