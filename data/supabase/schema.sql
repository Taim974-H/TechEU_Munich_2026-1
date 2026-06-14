-- Pactum Supabase schema
-- Document-style (non-relational) tables: each row is mostly a JSONB document
-- with a handful of promoted columns for filtering/indexing. No foreign key
-- constraints between tables - the application joins by id fields
-- (request_id, seller_id) at query time, like collections in a NoSQL store.
--
-- Only tables backing live reads in backend/data_access.py are defined here.
-- Run results (requirements, negotiation, validation, etc.) are generated
-- live per request and are not persisted — they stream straight to the UI.

-- ---------------------------------------------------------------------------
-- Buyer scenario blueprints: raw buyer requests for the scenario selector.
-- structured_requirements is intentionally absent — extraction always runs
-- live via Gemini (backend/agents/procurement_intelligence.py).
-- ---------------------------------------------------------------------------
create table if not exists buyer_scenarios (
  request_id text primary key,
  raw_request text not null,
  region text,
  priority text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seller registry: vendor profiles feeding clustering + negotiation persona
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
-- Seller inventory: flattened product rows across all merchants/inventories.
-- backend/data_access.py reads this table when present, otherwise flattens
-- the nested data/seller_inventory.json (merchants[] -> inventories[] ->
-- products[]) at request time.
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

-- ---------------------------------------------------------------------------
-- Tavily fallback results: saved external supplier/spec enrichment results
-- used as the replay-mode side track for integrations/tavily_client.py.
-- ---------------------------------------------------------------------------
create table if not exists tavily_fallback_results (
  id text primary key,
  query text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seller inventory products: extended catalog beyond the 34 curated demo
-- rows, filtered by category in data_access.get_products_for_requirements().
-- ---------------------------------------------------------------------------
create table if not exists seller_inventory_products (
  id text primary key,
  seller_id text not null,
  seller_name text,
  product text not null,
  category text,
  price_eur numeric,
  delivery_days integer,
  warranty_years numeric,
  availability text,
  product_keywords text[],
  length_mm numeric,
  power_watts numeric,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_seller_inventory_products_seller_id on seller_inventory_products (seller_id);
create index if not exists idx_seller_inventory_products_category on seller_inventory_products (category);

-- ---------------------------------------------------------------------------
-- Demo sessions: completed DemoResult payloads written by the buyer flow and
-- consumed by the seller Realtime dashboard. One row per session_id.
-- ---------------------------------------------------------------------------
create table if not exists demo_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  result jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_demo_sessions_created_at on demo_sessions (created_at desc);

-- Enable Supabase Realtime for the seller dashboard subscription.
-- Safe to re-run: adding a table that is already in the publication is a no-op.
alter publication supabase_realtime add table demo_sessions;
