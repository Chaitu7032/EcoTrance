CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  official_domain TEXT,
  aliases JSONB NOT NULL DEFAULT '[]',
  industry TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  company_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  mock_mode BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  notes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audits_company_id ON audits(company_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  category TEXT NOT NULL,
  source_url TEXT,
  source_name TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claim_date TIMESTAMPTZ,
  specificity_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  importance_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  integrity_score DOUBLE PRECISION,
  explanation TEXT
);

CREATE INDEX IF NOT EXISTS idx_claims_audit_id ON claims(audit_id);

CREATE TABLE IF NOT EXISTS subclaims (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  test_question TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subclaims_claim_id ON subclaims(claim_id);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  snippet TEXT,
  source_name TEXT,
  published_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  engine TEXT NOT NULL,
  query TEXT NOT NULL,
  source_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sources_audit_id ON sources(audit_id);
CREATE INDEX IF NOT EXISTS idx_sources_domain ON sources(domain);
CREATE INDEX IF NOT EXISTS idx_sources_url ON sources(url);
CREATE INDEX IF NOT EXISTS idx_sources_engine ON sources(engine);
CREATE INDEX IF NOT EXISTS idx_sources_published_at ON sources(published_at);

CREATE TABLE IF NOT EXISTS source_clusters (
  cluster_id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  canonical_source TEXT NOT NULL,
  domains JSONB NOT NULL DEFAULT '[]',
  similarity DOUBLE PRECISION NOT NULL DEFAULT 0,
  independence_score DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  subclaim_id TEXT NOT NULL REFERENCES subclaims(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  snippet TEXT,
  source_name TEXT,
  published_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  engine TEXT NOT NULL,
  source_type TEXT NOT NULL,
  relation TEXT NOT NULL,
  relevance_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  independence_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  freshness_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  freshness_band TEXT NOT NULL,
  explanation TEXT,
  cluster_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_evidence_claim_id ON evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_evidence_subclaim_id ON evidence(subclaim_id);
CREATE INDEX IF NOT EXISTS idx_evidence_domain ON evidence(domain);

CREATE TABLE IF NOT EXISTS evidence_relations (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS search_requests (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  query TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  response_hash TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  latency_ms INTEGER,
  claim_id TEXT,
  purpose TEXT,
  response_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_search_requests_audit_id ON search_requests(audit_id);
CREATE INDEX IF NOT EXISTS idx_search_requests_engine ON search_requests(engine);
CREATE INDEX IF NOT EXISTS idx_search_requests_query ON search_requests(query);
CREATE INDEX IF NOT EXISTS idx_search_requests_created ON search_requests(requested_at);

CREATE TABLE IF NOT EXISTS score_snapshots (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  claim_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim_events (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  event_date TIMESTAMPTZ,
  text TEXT NOT NULL,
  source_url TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS audit_metrics (
  audit_id TEXT PRIMARY KEY REFERENCES audits(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_engine_state (
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (audit_id, engine)
);

CREATE TABLE IF NOT EXISTS query_cache (
  cache_key TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  query TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
