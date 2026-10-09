# EcoTrace Search Engines

EcoTrace uses SerpApi to retrieve public evidence across multiple search surfaces. Each engine contributes a distinct signal type to the evidence ledger. No engine result is fabricated — all evidence comes from live or cached SerpApi responses.

## Active Engines (9 total)

### google — Web Search
**Purpose:** Primary evidence retrieval across public web pages, corporate sustainability reports, NGO publications, and regulatory filings.  
**Query types:** Support queries, conflict/criticism queries, entity resolution.  
**Source types produced:** `OFFICIAL_COMPANY`, `NEWS`, `NGO`, `GOVERNMENT`, `INDUSTRY`, `BLOG`, `OTHER`  
**Budget:** Used in both quick and deep audits.

---

### google_news — Google News
**Purpose:** Recent press coverage, journalist investigations, and newswire reports about the company's sustainability track record.  
**Query types:** News search for company sustainability topics, controversy scans.  
**Source types produced:** `NEWS`  
**Budget:** Used in both quick and deep audits.

---

### google_scholar — Google Scholar
**Purpose:** Peer-reviewed scientific literature and academic studies relevant to the technologies or methods claimed.  
**Query types:** Scientific queries derived from subclaim text (e.g., lifecycle assessment, additionality, carbon accounting).  
**Source types produced:** `SCIENTIFIC`, `ACADEMIC`  
**Budget:** Used when lifecycle/emission subclaims are detected.

---

### google_shopping — Google Shopping
**Purpose:** Product-level evidence — packaging claims, material certifications, and labeling on actual retail listings.  
**Query types:** Product search for company items when MATERIALS or PACKAGING subclaims are present.  
**Source types produced:** `PRODUCT`  
**Budget:** Deep audits and when material/packaging subclaims are detected.

---

### google_trends — Google Trends
**Purpose:** Public attention signal — measures how much public interest exists around the company's sustainability narrative vs. criticism.  
**Query types:** Trend data for `[company] sustainability` and `[company] greenwashing`.  
**Source types produced:** Provides `publicAttention` metric only (not stored as individual evidence items).  
**Budget:** Deep audits only.

---

### google_ads_transparency — Google Ads Transparency Center ⭐ New
**Purpose:** Surfaces paid advertising claims made by the company. This is the most direct greenwashing detection surface: if a company runs ads claiming "eco-friendly" or "carbon neutral" but independent evidence contradicts those claims, the discrepancy is a strong greenwashing signal.  
**Query types:** `[company] sustainability`, `[company] eco friendly`  
**Source types produced:** `AD_CLAIM`  
**Budget:** Used in both quick and deep audits.  
**Why it matters:** No other sustainability evidence tool inspects what companies pay to advertise. Advertising claims are explicitly chosen to influence consumer buying decisions, making them the highest-stakes claim surface. An ad claim that lacks independent backing is the operational definition of greenwashing.

---

### google_patents — Google Patents ⭐ New
**Purpose:** Verifies investment in the technologies claimed. A company claiming innovation in sustainable materials, carbon capture, or renewable energy should have corresponding patent filings as verifiable evidence.  
**Query types:** `[company] [technology keywords] patent`  
**Source types produced:** `PATENT`  
**Budget:** Used when MATERIALS, ENERGY, CARBON, RECYCLING, or CLIMATE claims are detected.  
**Why it matters:** Patents are date-stamped, legally filed records of R&D investment. Zero patents on a claimed technology is a significant evidence gap. Active filings matching claimed technology are strong, independent corroboration.

---

### google_forums — Google Forums ⭐ New
**Purpose:** Community discussions from Reddit, Quora, and consumer forums about the company's sustainability reputation. Forum posts represent genuine independent public opinion — high value for independence scoring because they come from individual consumers with no corporate affiliation.  
**Query types:** `[company] sustainability greenwashing`, `[company] environmental claims reddit`  
**Source types produced:** `FORUM`  
**Budget:** Used in both quick and deep audits.  
**Why it matters:** Syndicated press releases inflate independence scores artificially. Forum posts from real consumers are a corrective signal. The independence scoring model weights them highly because they are non-syndicated, non-corporate, and uncoordinated.

---

### youtube — YouTube Video Transcripts ⭐ New
**Purpose:** Extracts claims from sustainability report walkthroughs, CEO climate pledge presentations, and ESG press conferences posted on YouTube. Executive statements in video format are primary-source, attributable claims that no text-based engine captures.  
**Query types:** `[company] sustainability report 2024`, `[company] ESG annual report`  
**Source types produced:** `VIDEO_TRANSCRIPT`  
**Budget:** Deep audits only.  
**Why it matters:** Companies increasingly communicate sustainability commitments through video. A CEO's spoken pledge in a shareholder meeting is as claim-worthy as a written press release — and often more candid.

---

## Engine Execution Architecture

```
Entity resolution
  └─ google (single query)
        ↓
Claim discovery
  └─ google + google_news (sequential, planned queries)
        ↓
Claim decomposition (heuristic or LLM)
        ↓
Evidence retrieval — PARALLEL (all run simultaneously)
  ├─ google          (support + conflict queries per subclaim)
  ├─ google_news     (news queries per subclaim)
  ├─ google_scholar  (science queries for technical subclaims)
  ├─ google_shopping (product queries for material/packaging subclaims)
  └─ google_trends   (trend queries — deep audits only)
        ↓
Ads transparency scan
  └─ google_ads_transparency (greenwashing detection in paid ads)
        ↓
Patent scan (technical claims only)
  └─ google_patents
        ↓
Community scan
  └─ google_forums
        ↓
Video scan (deep audits only)
  └─ youtube
        ↓
Evidence normalization → clustering → scoring → graph → export
```

## Source Independence and Engine Weighting

The relevance scoring applies a bonus multiplier per engine to reflect evidence quality:

| Engine | Relevance bonus | Reason |
|---|---|---|
| `google_scholar` | +0.12 | Peer-reviewed, methodology-grounded |
| `google_patents` | +0.08 | Legally filed, date-stamped R&D evidence |
| `google_ads_transparency` | +0.05 | Direct corporate claim |
| All other engines | +0.00 | Standard evidence weight |

Forum sources (`google_forums`) and video transcripts (`youtube`) receive full independence scores because they are inherently non-syndicated.

## Synonym Expansion

Before relevance matching, claim and evidence text are expanded through a deterministic synonym map. This ensures "CO₂" matches "carbon", "net-zero" matches "climate neutral", "plastic" matches "packaging", etc. The expansion is fully deterministic — no API call is made. See `AuditOrchestrator.ts` → `SYNONYM_MAP` for the full list.

## Credit Budget

Each SerpApi call consumes one search credit. Cache hits consume zero. Budgets:

| Audit mode | Max searches | Engines |
|---|---|---|
| Quick | 8 live searches | google, google_news, google_scholar (conditional), google_shopping (conditional), google_ads_transparency, google_forums, google_patents (conditional) |
| Deep | 16 live searches | All 9 engines |

Set `SERPAPI_MOCK_MODE=true` in `backend/.env` to run with demo fixtures and no credit consumption.
