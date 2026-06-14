# CLAUDE.md — Pactum

Persistent working context for Claude Code in this repo.

---

## 1. What This Is

**Pactum** is a multi-agent B2B procurement negotiation layer. A buyer types a free-text procurement request; the system extracts requirements, clusters matching products, judges candidates, negotiates live with ranked suppliers, pauses for human strategy selection, and produces an audited recommendation.

Hackathon-grade vertical slice — not a full procurement platform. Any product type (GPUs, chairs, sensors, etc.).

**Demo wins when a judge can see:**
- Buyer types a custom prompt and clicks one button.
- Agent feed runs line by line in real time — LLM calls happen live.
- Gemini extracts structured requirements from free text.
- Products cluster by spec similarity across all 7 vendor inventories.
- A Judging Agent explains in natural language why each candidate is good, borderline, or bad.
- A mid-flow human alert pauses the stream and asks for a negotiation strategy (Aggressive / Medium / Light).
- Negotiation Agent runs multi-round Gemini dialogue (5/3/2 rounds, 18%/8%/4% target discount). Messages ≤50 words, conversational.
- Seller enforces a deterministic 10% price floor — if buyer pushes below it, seller rejects (no Gemini call) and the system waterfalls to the next supplier.
- Pioneer labels seller messages and extracts offer fields.
- Tavily enriches missing supplier/spec info.
- fal generates a visual deal card.
- A second human alert pauses for final approval.
- Audit/Summary Subagent explains the final recommendation.

---

## 2. Architecture

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
Judging Agent  ← judge_candidates() via Gemini per candidate
  ↓
[human_alert: strategy_selection]  ← pauses SSE; buyer picks Aggressive/Medium/Light
  ↓
Negotiation Agent  ← multi-round Gemini; waterfall across ranked suppliers
  ├─ Price / Delivery / Warranty / Risk sub-agents
  └─ Deterministic 10% seller floor (no Gemini when floor crossed)
  ↓
Pioneer  ← labels generated seller messages; extracts offer fields
  ↓
[human_alert: approval]  ← pauses SSE; buyer approves/rejects/adjusts
  ↓
Audit/Summary Subagent  ← Gemini narrative
  ↓
fal Deal Card
  ↓
done event (carries full DemoResult)
```

### SSE event order (frozen)

```
requirements → cluster → match → [human_alert: strategy_selection] →
negotiation_turn* → [supplier_fallback] → validation → [human_alert: approval] →
escalation → recommendation → audit → done
```

`human_alert` pauses the stream. `POST /api/human-response` resumes it.

### Custom prompt flow (default)

- Buyer types freely; `request_id` is optional; orchestrator assigns `CUSTOM-<uuid>`.
- Unknown products do not fall through to GPU/chair/sensor inventory.
- If no internal match, Tavily enrichment becomes the visible fallback.

### Replay/fallback (DEMO_MODE=true)

- `POST /api/run-demo` (blocking) replays a saved transcript.
- No API keys required. Use as the CTO safety net during live judging.
- UI banner shows "Live LLM mode" vs "Replay mode".

---

## 3. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Primary frontend | Next.js 15 | `frontend/` — buyer, seller, and root views |
| Legacy frontend | Streamlit | `streamlit_app.py` — fallback only |
| Backend | FastAPI | `backend/api.py` — both UIs |
| Primary LLM | Gemini 2.5 Flash | `integrations/gemini_client.py` |
| Message labeling | Pioneer | `integrations/pioneer_client.py` |
| External enrichment | Tavily | `integrations/tavily_client.py` |
| Deal card | fal | `integrations/fal_client.py` |
| Realtime | Supabase Realtime | seller dashboard subscribes to `demo_sessions` |

**LLM routing rule:** deterministic Python owns all pass/fail decisions. Gemini owns language: extraction, negotiation dialogue, judging reasoning, audit. Never let Gemini override a hard constraint check.

### Deterministic validation (never delegate to LLM)

```
length_mm     <= max_length_mm      (presence-gated)
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

### Timeouts and fallbacks

| API | Timeout | Retry | Fallback |
|-----|---------|-------|---------|
| Gemini | 15–20s | 1x | Templated string |
| Pioneer | 10–15s | 1x | `fallback_outputs.py` |
| Tavily | 8–12s | 1x | `data/tavily_fallback_results.json` |
| fal | 20–30s | 1x | `assets/fal_deal_card.png` |

---

## 4. Directory Structure

```
pactum/
├── backend/
│   ├── api.py                      FastAPI routes (SSE + blocking + HITL)
│   ├── orchestrator.py             run_demo_events() generator; strategy alert; waterfall
│   ├── hitl_sessions.py            in-memory pause/resume queues
│   ├── schemas.py                  all TypedDicts/Pydantic (source of truth for shapes)
│   ├── prompts.py                  ALL Gemini prompts centralized here
│   ├── data_access.py              local JSON reads + write_demo_session() to Supabase
│   └── agents/
│       ├── procurement_intelligence.py   extract_requirements() + validate_offer()
│       ├── product_clustering.py         cluster_products()
│       ├── product_utils.py              category-safe keyword matching
│       ├── supplier_matching.py          BM25-style scoring
│       ├── judging_agent.py              judge_candidates() via Gemini
│       ├── negotiation_agent.py          run_negotiation() waterfall; negotiate_one_supplier()
│       ├── negotiation/
│       │   ├── price.py / delivery.py / warranty.py / risk.py
│       │   └── guardrails.py             system-prompt + post-gen word-count check
│       ├── human_escalation.py           escalation trigger logic
│       └── audit_summary.py              Gemini narrative
│
├── integrations/
│   ├── gemini_client.py            generate(prompt, *, system, temperature, json_mode) → str
│   ├── pioneer_client.py
│   ├── tavily_client.py
│   ├── fal_client.py
│   └── fallback_outputs.py
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            root orchestration view
│   │   │   └── seller/page.tsx     seller role page
│   │   ├── buyer/BuyerWorkspace.tsx   real SSE streaming; StrategyModal; EscalationModal
│   │   ├── seller/SellerWorkspace.tsx Supabase Realtime subscription
│   │   └── lib/
│   │       ├── api.ts              runDemo, getScenarios, getInventory, postHumanResponse
│   │       ├── stream.ts           EventSource client; sendStrategyChoice; sendHumanResponse
│   │       ├── types.ts            all frontend types (mirror backend schemas)
│   │       └── demoMachine.ts      stage/reveal machine; STAGE_REVEALS; STAGE_DURATION_MS
│   └── components/
│       ├── auth/LoginScreen.tsx    hardcoded demo roles (buyer/seller/root)
│       ├── screens/DecisionScreen.tsx
│       ├── modals/StrategyModal.tsx    Aggressive/Medium/Light cards
│       ├── modals/EscalationModal.tsx
│       ├── feed/ActivityFeed.tsx   event-append; rejection/fallback row variants
│       ├── hero/AgentNetwork.tsx
│       ├── hero/MessageEdge.tsx
│       ├── input/RequestForm.tsx   empty custom prompt is default
│       └── sections/               ValidationTable, StructuredRequirements, SellerInventoryView, …
│
├── data/
│   ├── seller_registry.json        7 vendor profiles
│   ├── seller_inventory.json       nested merchants→inventories→products; 34 products
│   ├── buyer_scenarios.json        blueprints REQ-001–005 (no structured_requirements)
│   └── tavily_fallback_results.json
│
├── assets/fal_deal_card.png        fallback deal card image
├── tests/
│   ├── test_validation.py
│   ├── test_hitl.py
│   └── test_generalized_matching.py
├── requirements.txt
├── .env                            git-ignored
└── .env.example
```

---

## 5. Commands

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
python -m pytest

# Lint
ruff check . && ruff format .
mypy backend integrations

# CLI demo run
python -m backend.orchestrator
```

---

## 6. API Contracts (frozen)

### Streaming (primary)

```
GET /api/run-demo/stream?raw_request=...&region=...
Content-Type: text/event-stream
→ { "type": "<event_type>", "stage": "<stage>", "data": {...}, "ts": <ms> }
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
Body: { "session_id": "...", "action": "approve"|"reject"|"adjust", "note": "...", "strategy": "aggressive"|"medium"|"light" }
Returns: { "ok": true }
```

### Other routes

```
GET /api/scenarios    → BuyerBlueprint[]
GET /api/inventory    → nested seller inventory
GET /api/config       → { "demo_mode": bool }
```

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
`max_length_mm` and `max_power_watts` are presence-gated — omitted when not stated by buyer.

**ConversationLog** (Phase 6 shape):
```json
{
  "seller_id": "vendor_b", "seller_name": "Vendor B",
  "speaker": "buyer"|"seller"|"system",
  "message": "...", "round": 2,
  "event_kind": "turn"|"seller_rejection"|"supplier_fallback"|"strategy_selected",
  "is_rejection": false,
  "pioneer_labels": ["price_concession"],
  "risk_level": "low",
  "extracted_fields": { "price_eur": 608 }
}
```

**DemoResult** (stable keys — additions are additive):
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

Do not silently rename or remove any existing DemoResult key — frontend components depend on them.

---

## 7. Environment Variables

```
DEMO_MODE=false          # true = replay; false = live LLM (default)
LLM_API_KEY              # Gemini key
LLM_PROVIDER=gemini
PIONEER_API_KEY
PIONEER_BASE_URL
TAVILY_API_KEY
FAL_KEY / FAL_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
GMAIL_ADDRESS            # stretch
GMAIL_APP_PASSWORD       # stretch
```

Frontend (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Never hardcode keys. Never commit `.env`. System must run without keys in replay mode.

---

## 8. Supabase Setup (run once)

```sql
create table if not exists demo_sessions (
  id          uuid        primary key default gen_random_uuid(),
  session_id  text        unique not null,
  result      jsonb       not null,
  created_at  timestamptz default now()
);
alter publication supabase_realtime add table demo_sessions;
```

Realtime flow: buyer run completes → `write_demo_session()` upserts → seller dashboard subscription fires.

---

## 9. Coding Conventions

- All Gemini prompts live in `backend/prompts.py`. Never scatter prompt strings in agent files.
- Guardrail system prompts stay in `backend/agents/negotiation/guardrails.py`.
- All schemas in `backend/schemas.py`. Keep aligned with Section 6 contracts.
- Catch all external API errors inside integration clients. Return structured fallbacks. Never crash the UI flow.
- Prefer clear names over clever abstractions.
- Every Gemini call must have a fallback path.
- `product_type` + `product_keywords` are the source of truth for what product the buyer wants. Do not remap an unknown product into GPUs, chairs, or sensors.

---

## 10. Hard Rules

**Do:**
- Keep LLM calls real and visible — no pre-written dialogue.
- Stream agent feed line by line.
- Explain every rejection with natural language from the judging agent.
- Keep the human in control at two decision points (strategy selection + final approval).
- Use `DEMO_MODE=true` as the safety net if live APIs are unstable.

**Do not:**
- Let any LLM override deterministic validation.
- Break existing DemoResult key shapes.
- Silently remap unknown product categories to demo inventory categories.
- Hardcode secrets or commit `.env`.
- Add complexity toggles — show full orchestration to everyone.
- Build real purchasing, payments, or real vendor messaging.

---

## 11. Remaining Work

| Item | Priority |
|------|----------|
| Supabase `demo_sessions` table (SQL above) | Required for Realtime |
| `assets/fal_deal_card.png` fallback image | Before demo |
| Replay transcript save (`DEMO_MODE=true` full path) | Medium |
| `integrations/email_hitl.py` Gmail loop | Stretch |
| Aikido security scan screenshot | Medium |
