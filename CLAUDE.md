# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What This Is

**Pactum** is a multi-agent B2B procurement negotiation layer built for TechEU Munich 2026. A buyer types a free-text procurement request; agents extract requirements, cluster matching products, judge candidates, negotiate live in parallel with 3 ranked suppliers, validate offers against deterministic constraints, and produce an audited recommendation with one human approval gate at the end.

**Demo wins when a judge can see:**
- Buyer types a custom prompt and clicks one button.
- Agent feed runs line by line in real time — LLM calls happen live.
- Gemini extracts structured requirements from free text.
- Products cluster by spec similarity across all 7 vendor inventories. Judging runs in parallel (~5s for all clusters).
- A Judging Agent explains in natural language why each candidate is good, borderline, or bad.
- Negotiation Agent runs 3 suppliers in parallel with real-time turn streaming (5/3/2 rounds, 18%/8%/4% discount targets). Messages ≤50 words. Strategy auto-selected from Gemini-extracted requirements or defaults to `medium`.
- Seller enforces a deterministic 10% price floor — if buyer pushes below it, seller rejects (no Gemini call) and the system waterfalls to the next supplier.
- Pioneer labels seller messages and extracts offer fields.
- Tavily enriches missing supplier/spec info.
- fal generates a visual deal card.
- One human alert pauses for final approval.
- Audit/Summary Subagent explains the final recommendation.

---

## Architecture

```
Human Buyer (custom prompt)
  ↓
Next.js 15 frontend  →  GET /api/run-demo/stream (SSE)
                         POST /api/human-response (mid-flow resume)
  ↓
FastAPI  backend/api.py
  ↓
backend/orchestrator.py  run_demo_events() → yields SSE events
  ↓
Procurement Intelligence Agent  ← extract_requirements() via Gemini
  ↓
Product Clustering  ← cluster_products() deterministic euclidean distance
  ↓
Supplier Matching  ← BM25-style scoring from seller_registry
  ↓
Judging Agent  ← judge_candidate() via Gemini, all clusters in parallel (ThreadPoolExecutor)
  ↓
Negotiation Agent  ← 3 suppliers run in parallel; turns stream live via queue.Queue
  ├─ Price / Delivery / Warranty / Risk sub-agents
  └─ Deterministic 10% seller floor (no Gemini when floor crossed)
  ↓
Pioneer  ← labels generated seller messages; extracts offer fields
  ↓
Validation  ← deterministic constraint checks per offer
  ↓
[human_alert: approval_required]  ← only HITL pause; buyer approves/rejects/renegotiates
  ↓
Audit/Summary Subagent  ← Gemini narrative
  ↓
fal Deal Card
  ↓
done event (carries full DemoResult)
```

### SSE event order (frozen)

```
requirements → cluster* → match* → top_candidates →
negotiation_turn* → pioneer → validation* →
[human_alert: approval_required] → escalation → recommendation → audit → fal → done
```

`*` = repeating. `human_alert` pauses the SSE stream. `POST /api/human-response` resumes it. There is exactly **one** human pause point (final approval).

### Parallelism in orchestrator.py

- **Judging**: `concurrent.futures.ThreadPoolExecutor`, `as_completed()` — events emit as each call returns.
- **Negotiation**: 3 worker threads feed into a shared `queue.Queue`; the main thread drains it and `yield`s each turn with a sleep delay to simulate human typing pace.

### Custom prompt flow (default)

- Buyer types freely; `request_id` is optional; orchestrator assigns `CUSTOM-<uuid>`.
- Unknown products do not fall through to GPU/chair/sensor inventory.
- `product_type` + `product_keywords` are the source of truth — never remap.
- If no internal match, Tavily enrichment becomes the visible fallback.

### Replay/fallback (DEMO_MODE=true)

- `POST /api/run-demo` (blocking) uses saved/fallback data.
- No API keys required. Use as the safety net during live judging.

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Primary frontend | Next.js 15 | `frontend/` — buyer, seller, root views |
| Legacy frontend | Streamlit | `streamlit_app.py` — fallback only |
| Backend | FastAPI | `backend/api.py` |
| Primary LLM | Gemini 2.5 Flash | `integrations/gemini_client.py` |
| Message labeling | Pioneer | `integrations/pioneer_client.py` |
| External enrichment | Tavily | `integrations/tavily_client.py` |
| Deal card | fal | `integrations/fal_client.py` |
| Realtime | Supabase Realtime | seller dashboard subscribes to `demo_sessions` INSERT |

**LLM routing rule:** deterministic Python owns all pass/fail decisions. Gemini owns language. Never let Gemini override a hard constraint check.

### Deterministic validation (never delegate to LLM)

```
length_mm     <= max_length_mm      (presence-gated — omitted if buyer didn't specify)
power_watts   <= max_power_watts    (presence-gated)
price_eur     <= budget_eur
delivery_days <= max_delivery_days
warranty_years >= minimum_warranty_years
```

### Negotiation strategy curves (deterministic)

| Strategy | Max rounds | Discount target | Outcome vs 10% floor |
|----------|-----------|----------------|----------------------|
| Light | 2 | 2%→4% | Always above floor → accepted |
| Medium | 3 | 3%→8% | Always above floor → accepted |
| Aggressive | 5 | 4%→12%+ | Crosses floor at round 3 → rejected → waterfall |

Strategy is read from `structured_requirements["negotiation_strategy"]` (Gemini-extracted) or defaults to `"medium"`. No user modal.

### Timeouts and fallbacks

| API | Timeout | Retry | Fallback |
|-----|---------|-------|---------|
| Gemini | 15–20s | 1x | Templated string |
| Pioneer | 10–15s | 1x | `fallback_outputs.py` |
| Tavily | 8–12s | 1x | `data/tavily_fallback_results.json` |
| fal | 20–30s | 1x | `assets/fal_deal_card.png` |

---

## Commands

```bash
# Setup
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys

# Run full stack
uvicorn backend.api:app --reload --port 8000   # terminal 1
cd frontend && npm install && npm run dev       # terminal 2
# Open http://localhost:3000
# Login: buyer/123 · seller/123 · root/root

# Replay mode (no API keys needed)
DEMO_MODE=true uvicorn backend.api:app --reload --port 8000

# Tests
python -m pytest                          # all 17 tests
python -m pytest tests/test_hitl.py -v   # single file
python -m pytest tests/ -k "hitl" -v     # by keyword

# Lint / type-check
ruff check . && ruff format .
mypy backend integrations

# CLI demo run (no frontend)
python -m backend.orchestrator
```

---

## API Contracts (frozen)

### Streaming (primary)

```
GET /api/run-demo/stream?raw_request=...&region=...
Content-Type: text/event-stream
→ { "type": "<event_type>", "stage": "<stage>", "data": {...}, "session_id": str, "ts": <ms> }
```

### Blocking (replay / Streamlit fallback)

```
POST /api/run-demo
Body: BuyerRequest
Returns: DemoResult
```

### Human response (mid-flow resume)

```
POST /api/human-response
Body: { "session_id": "...", "action": "approve"|"reject"|"renegotiate", "note": "..." }
Returns: { "ok": true }
```

### Inventory endpoints

```
GET /api/seller-inventory   → flat list of all 35 products (seller_id on each row) — USE THIS
GET /api/inventory          → nested merchants→inventories→products structure
GET /api/scenarios          → BuyerBlueprint[]
GET /api/config             → { "demo_mode": bool }
GET /api/latest-session     → most recent DemoResult (in-memory fallback when Supabase not set)
```

The frontend's `SellerWorkspace` uses `/api/seller-inventory` (flat). The nested `/api/inventory` exists for backward compat only — Supabase's `seller_inventory` table may not exist.

### Key shapes

**StructuredRequirements** (Gemini-extracted):
```json
{
  "product_type": "GPU",
  "product_keywords": ["gpu", "graphics", "card"],
  "use_case": "AI workstation",
  "max_length_mm": 300,
  "max_power_watts": 250,
  "budget_eur": 650,
  "max_delivery_days": 7,
  "warranty_required": true,
  "minimum_warranty_years": 1,
  "extra_constraints": [],
  "negotiation_strategy": "medium"
}
```

**ConversationLog**:
```json
{
  "seller_id": "vendor_b", "seller_name": "Vendor B",
  "speaker": "buyer"|"seller"|"system",
  "message": "...", "round": 2,
  "event_kind": "turn"|"seller_rejection"|"supplier_fallback"|"renegotiation_start",
  "pioneer_labels": ["price_concession"],
  "risk_level": "low",
  "extracted_fields": { "price_eur": 608 }
}
```

**DemoResult** (stable keys — additions are additive, never rename/remove):
```json
{
  "request": {}, "structured_requirements": {},
  "clusters": [], "judged_candidates": [],
  "matched_suppliers": [], "conversation_logs": [],
  "pioneer_labels": [], "validation_results": [],
  "tavily_enrichment": {}, "escalation_result": {},
  "audit_summary": "", "final_recommendation": {},
  "deal_card_path": "assets/fal_deal_card.png",
  "demo_mode": false,
  "negotiation_strategy": "medium",
  "negotiation_outcome": {
    "status": "accepted",
    "strategy": "medium",
    "winning_seller_id": "vendor_b",
    "rejected_sellers": []
  }
}
```

---

## Environment Variables

```
DEMO_MODE=false          # true = replay mode; false = live LLM (default)
LLM_API_KEY              # Gemini key
LLM_PROVIDER=gemini
PIONEER_API_KEY
PIONEER_BASE_URL
TAVILY_API_KEY
FAL_KEY / FAL_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SKIP=true       # force local-only mode even if Supabase vars are set
LOCAL_ONLY_READS=true    # skip seller_inventory_products Supabase query
```

Frontend (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Supabase Setup (run once)

Only the `demo_sessions` table is required for seller Realtime. The `seller_inventory` table is NOT required — the frontend uses the REST API.

```sql
create table if not exists demo_sessions (
  id          uuid        primary key default gen_random_uuid(),
  session_id  text        unique not null,
  result      jsonb       not null,
  created_at  timestamptz default now()
);
alter publication supabase_realtime add table demo_sessions;
```

Realtime flow: buyer run completes → `write_demo_session()` upserts → seller dashboard Realtime subscription fires.

---

## Coding Conventions

- All Gemini prompts live in `backend/prompts.py`. Never scatter prompt strings in agent files.
- Guardrail system prompts stay in `backend/agents/negotiation/guardrails.py`.
- All schemas in `backend/schemas.py`. Keep aligned with API Contracts section above.
- Catch all external API errors inside integration clients. Return structured fallbacks. Never crash the UI flow.
- `product_type` + `product_keywords` are the source of truth for what product the buyer wants. Do not remap an unknown product into GPUs, chairs, or sensors.
- Every Gemini call must have a fallback path.

---

## Hard Rules

**Do:**
- Keep LLM calls real and visible — no pre-written dialogue.
- Stream agent feed line by line.
- Explain every rejection with natural language from the judging agent.
- Keep the human in control at one decision point: final approval.
- Use `DEMO_MODE=true` as the safety net if live APIs are unstable.

**Do not:**
- Let any LLM override deterministic validation.
- Break existing DemoResult key shapes.
- Silently remap unknown product categories to demo inventory categories.
- Add a `strategy_selection` HITL pause — strategy is now auto-selected.
- Build real purchasing, payments, or real vendor messaging.
