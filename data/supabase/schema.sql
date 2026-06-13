-- Pactum Supabase schema
-- Document-style (non-relational) tables: each row is mostly a JSONB document
-- with a handful of promoted columns for filtering/indexing. No foreign key
-- constraints between tables - the application joins by id fields
-- (request_id, seller_id) at query time, like collections in a NoSQL store.

-- ---------------------------------------------------------------------------
-- Buyer scenarios: raw buyer requests + extracted structured requirements
-- ---------------------------------------------------------------------------
create table if not exists buyer_scenarios (
  request_id text primary key,
  raw_request text not null,
  region text,
  priority text,
  structured_requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seller registry: vendor profiles
-- ---------------------------------------------------------------------------
create table if not exists seller_registry (
  seller_id text primary key,
  seller_name text not null,
  specialization text,
  region text,
  reliability_score numeric,
  negotiation_style text,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seller inventory: products offered by each vendor
-- ---------------------------------------------------------------------------
create table if not exists seller_inventory (
  id text primary key,
  seller_id text not null,
  seller_name text,
  product text not null,
  length_mm numeric,
  power_watts numeric,
  price_eur numeric,
  delivery_days integer,
  warranty_years numeric,
  availability text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_seller_inventory_seller_id on seller_inventory (seller_id);
create index if not exists idx_seller_inventory_data on seller_inventory using gin (data);

-- ---------------------------------------------------------------------------
-- Conversation logs: synthetic + live negotiation messages
-- ---------------------------------------------------------------------------
create table if not exists conversation_logs (
  id text primary key,
  request_id text not null,
  seller_id text not null,
  speaker text not null check (speaker in ('buyer', 'seller')),
  round integer not null,
  message text not null,
  pioneer_labels jsonb not null default '[]'::jsonb,
  risk_level text check (risk_level in ('low', 'medium', 'high', 'unknown')),
  extracted_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_logs_request_id on conversation_logs (request_id);
create index if not exists idx_conversation_logs_seller_id on conversation_logs (seller_id);

-- ---------------------------------------------------------------------------
-- Validation results: technical/commercial validation of each seller offer
-- ---------------------------------------------------------------------------
create table if not exists validation_results (
  id text primary key,
  request_id text not null,
  seller_id text not null,
  status text not null check (status in ('passed', 'rejected', 'negotiable', 'missing_information')),
  failed_constraints jsonb not null default '[]'::jsonb,
  score numeric,
  next_action text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_validation_results_request_id on validation_results (request_id);

-- ---------------------------------------------------------------------------
-- Escalation results: human-in-the-loop escalation decisions
-- ---------------------------------------------------------------------------
create table if not exists escalation_results (
  id text primary key,
  request_id text not null,
  escalate boolean not null default false,
  reason text,
  question_for_human text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_escalation_results_request_id on escalation_results (request_id);

-- ---------------------------------------------------------------------------
-- Audit summaries: final human-readable negotiation report
-- ---------------------------------------------------------------------------
create table if not exists audit_summaries (
  id text primary key,
  request_id text not null,
  summary text not null,
  recommended_seller text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_summaries_request_id on audit_summaries (request_id);

-- ---------------------------------------------------------------------------
-- Final recommendations: the recommendation object shown to the human buyer
-- ---------------------------------------------------------------------------
create table if not exists final_recommendations (
  id text primary key,
  request_id text not null,
  recommended_seller text,
  recommended_product text,
  price_eur numeric,
  delivery_days integer,
  technical_status text,
  risk_level text,
  reason text,
  human_approval_required boolean default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_final_recommendations_request_id on final_recommendations (request_id);

-- ---------------------------------------------------------------------------
-- Pioneer inference examples: labeled examples for runtime inference fallback
-- ---------------------------------------------------------------------------
create table if not exists pioneer_inference_examples (
  id text primary key,
  message text not null,
  labels jsonb not null default '[]'::jsonb,
  risk_level text check (risk_level in ('low', 'medium', 'high', 'unknown')),
  extracted_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tavily fallback results: saved external supplier/spec enrichment results
-- ---------------------------------------------------------------------------
create table if not exists tavily_fallback_results (
  id text primary key,
  query text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Edge cases: scenarios designed to trigger specific escalation/validation paths
-- ---------------------------------------------------------------------------
create table if not exists edge_cases (
  id text primary key,
  title text not null,
  description text not null,
  request_id text,
  trigger jsonb not null default '{}'::jsonb,
  expected_escalation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
