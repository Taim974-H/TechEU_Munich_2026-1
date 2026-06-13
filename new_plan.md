# Pactum — New Implementation Plan (Live LLM Architecture)

> Replaces the static-data demo with a real-time, Gemini-driven negotiation system.
> Planning document only — no code is written here. Phases are sized for a 3-developer
> hackathon team working in parallel. Read Phase 0 before touching anything.

---

## 1. Overview

The current system reads pre-written conversations from JSON and makes zero LLM calls — a reviewer opening `backend/` sees deterministic file-reads dressed up as agents. This plan deletes all canned dialogue, wires **Gemini** into a refactored negotiation agent and a new judging agent so conversation and reasoning are generated live, and adds a **product-clustering** step plus **human-in-the-loop** (inline alert + email). The frontend keeps its one-button trigger but switches from a single blocking response to a **streaming agent feed** that renders each LLM turn as it is produced, so the system visibly *thinks* instead of instantly returning files.

---

## 2. What to Delete

Delete from `data/` (these are pre-written dialogue or dead precomputed outputs — grep confirms only `data/scripts/seed_supabase.py` references the dead ones at runtime):

| File | Why |
|------|-----|
| `data/synthetic_negotiations.json` | Pre-written negotiation dialogue — the core offense. |
| `data/buyer_scenarios.json` (the `structured_requirements` block in each entry) | Hardcoded canonical requirements that bypass live extraction. Rebuild as blueprints (see §3 keep). |
| `data/edge_cases.json` | Canned scenario outputs, unused at runtime. |
| `data/audit_summaries.json` | Pre-written audit narratives. |
| `data/validation_results.json` | Precomputed validation output. |
| `data/escalation_results.json` | Precomputed escalation output. |
| `data/final_recommendations.json` | Precomputed recommendation output. |
| `data/pioneer_inference_examples.json` | Precomputed labels, unused at runtime. |

Delete / neutralize in code:

| Target | Action |
|--------|--------|
| `procurement_intelligence.py::_get_scenario_lookup()` + `_scenario_lookup_cache` | **Remove entirely.** This silently returns canonical `structured_requirements` keyed on `request_id` for REQ-001/002/003, so extraction never runs for the demo scenarios. If left in, the reviewer catches the same hardcoding. Extraction must run live for every request. |
| Hardcoded f-string messages in `buyer_agent.py` / `seller_agent.py` | Deleted when these files are refactored into `negotiation_agent.py` (Phase 2). No literal dialogue strings survive. |
| `data/scripts/seed_supabase.py` references to deleted files | Trim the seeder so it only seeds the kept tables. Non-blocking — fix opportunistically. |

> Keep `data/tavily_fallback_results.json` and `assets/fal_deal_card.png` — these back Tavily/fal, which remain replay-only side tracks.

---

## 3. What to Keep

| File / Asset | Status |
|--------------|--------|
| `data/seller_registry.json` | **Keep.** Vendor profiles, `negotiation_style`, `region`, `reliability_score` feed both clustering and the negotiation agent's persona. |
| `data/seller_inventory.json` | **Keep the spec data**, restructure shape (flat array → nested `merchants[] → inventories[] → products[]`, see §6.1). Specs (`length_mm`, `power_watts`, `price_eur`, `delivery_days`, `warranty_years`, `availability`) are unchanged. |
| `data/buyer_scenarios.json` → rebuilt as **buyer blueprints** | Keep the *request* fields (`request_id`, `raw_request`, `region`, `priority`) for the scenario selector; **strip the `structured_requirements` block** so requirements are extracted live. Target 3 distinct product categories. |
| Deterministic validation in `procurement_intelligence.py::validate_offer()` + `compute_value_score()` | **Keep exactly.** Python still decides pass/fail. |
| `backend/api.py` existing routes `GET /api/scenarios`, `POST /api/run-demo` | **Keep** (run-demo stays as the non-streaming/replay path; streaming added alongside, see §11). |
| `backend/data_access.py` Supabase-with-local-fallback pattern | **Keep the pattern**; table/file shapes change. |
| `integrations/{tavily,fal,pioneer}_client.py` + `fallback_outputs.py` | **Keep** as replay-only side tracks. Pioneer labeling stays as a post-hoc tag on generated messages. |
| All Next.js section components (`StructuredRequirements`, `SupplierGrid`, `ValidationTable`, `EscalationBanner`, `FinalRecommendation`, `AuditSummary`, `TavilyCard`) | **Keep** — they survive because the result keys they read stay stable (see §12). |
| `streamlit_app.py` | **Keep** as legacy fallback UI. Not on the critical path; do not invest in it. |

---

## 4. Phase 0 — Shared Setup (≈1–2 h, BLOCKS ALL parallel work)

One developer drives this with the other two reviewing in the same room. Nobody starts Phase 1 until **all four contracts below are frozen in writing** (commit them as `docs/contracts.md` or comments in `schemas.py`). Getting these vague makes the dependency map wrong.

**0.1 — Branch setup** (Owner: Dev A)
- Cut `feature/llm-core` (Dev A), `feature/agent-arch` (Dev B), `feature/realtime-ui` (Dev C) from `main`. Integration branch `staging-demo` already exists.

**0.2 — Gemini decision + key wiring** (Owner: Dev A) — *contract 1*
- Pick **one** SDK: `google-genai` (newer, recommended) vs `google-generativeai`. Add the chosen one to `requirements.txt`.
- Decide env var: **reuse existing `LLM_API_KEY` + set `LLM_PROVIDER=gemini`**, OR add `GEMINI_API_KEY`. Pick one; update `.env.example`. (Recommend reusing `LLM_API_KEY` to avoid a new var.)
- Freeze the client interface (one wrapper, all calls go through it):
  ```
  integrations/gemini_client.py
    generate(prompt: str, *, system: str | None = None,
             temperature: float = 0.7, json_mode: bool = False) -> str
  ```
  Timeout 15–20s, retry once, fallback to a templated string on failure. No SDK method names are mandated here — implementation detail.

**0.3 — Nested data schema frozen** (Owner: Dev B, reviewed by all) — *contract 2*
- Agree the `merchants[] → inventories[] → products[]` shape (see §6.1) and the accessor signatures in `data_access.py`. Clustering, negotiation, and the seller-inventory UI view all depend on this.

**0.4 — Streaming event schema frozen** (Owner: Dev C, reviewed by all) — *contract 3, the linchpin*
- Today `/api/run-demo` is one blocking POST returning the whole `DemoResult`. The real-time feed is incompatible with that. **Decide the mechanism now:**
  - **SSE** (`GET /api/run-demo/stream`) emitting newline-delimited JSON events for the feed, **plus** a separate `POST /api/human-response` for the mid-flow human reply. (Recommended — simplest hackathon path. Use WebSocket only if you want one bidirectional channel.)
- Freeze the event envelope, e.g.:
  ```
  { "type": "...", "stage": "...", "data": {...}, "ts": <ms> }
  ```
  Frozen event `type`s (order matters — this is what Dev C builds the feed against):
  `requirements` · `cluster` · `match` · `negotiation_turn` (one per LLM line) ·
  `validation` · `human_alert` (pauses flow) · `escalation` · `recommendation` ·
  `audit` · `done` · `error`.
- The terminal `done` event carries the full `DemoResult` so existing section components hydrate from one object (keeps §12 keys stable).

**0.5 — DEMO_MODE semantics flip** (Owner: Dev A, one-line decision) — *contract 4*
- Today `DEMO_MODE=true` is the **default** and short-circuits everything to static files — exactly what the reviewer condemns. **Flip it:** live Gemini is the default path; `DEMO_MODE=true` / "Replay mode" becomes the *opt-in safety net* (saved transcript) for the CTO-facing run if APIs wobble. The UI banner shows "Live LLM mode" vs "Replay mode" off this flag.

**Phase 0 exit criteria:** `gemini_client.generate()` signature, nested data shape, streaming event list, and the DEMO_MODE flip are all committed. Then Phases 1 split cleanly.

---

## 5. Phase 1 — Core LLM Integration (≈3–4 h, parallel)

Goal: a real Gemini call exists and produces live text; data is restructured; the streaming transport is stood up empty. No agent intelligence yet — that's Phase 2.

### Dev A — Gemini client + live requirement extraction
- **Build `integrations/gemini_client.py`** implementing the frozen `generate()` interface (real call + retry + templated fallback). *Depends on: 0.2.*
- **Rewrite `procurement_intelligence.py::extract_requirements()`** to call Gemini in `json_mode` to parse `raw_request` → `StructuredRequirements`, with the existing regex as the fallback path. **Delete the scenario lookup.** Keep `validate_offer()` and `compute_value_score()` untouched. *Depends on: gemini_client.*
- **Deliverable:** typing a free-text request yields LLM-extracted requirements for any input, including the 3 blueprint scenarios.

### Dev B — Data restructure + product clustering skeleton
- **Restructure `seller_inventory.json`** to nested `merchants[] → inventories[] → products[]` and **update `data_access.py`** accessors to match the frozen shape (keep Supabase-fallback pattern). *Depends on: 0.3.*
- **Rebuild `buyer_scenarios.json` → blueprints** (strip `structured_requirements`, 3 distinct categories). *Depends on: 0.3.*
- **Create `backend/agents/product_clustering.py`** — `cluster_products(requirements, all_products) -> list[ProductCluster]`. Iterates all sellers→inventories→products→specs and groups products by **spec similarity** (normalized distance over length/power/price/delivery/warranty; not exact match). Output = ranked candidate clusters. **This is a new step that sits *before* the judging agent; it replaces the role of `supplier_matching.py` as the candidate generator** (supplier_matching may be retired or folded in — Dev B's call, documented). *Depends on: nested data shape.*
- **Deliverable:** given live requirements, clustering returns ranked candidate clusters from real inventory.

### Dev C — Streaming transport (empty pipe)
- **Add the streaming endpoint to `backend/api.py`** per the frozen schema (SSE `GET /api/run-demo/stream` + `POST /api/human-response`). Wire CORS. Initially it can replay a stub sequence of the frozen event types — no real agent output yet. *Depends on: 0.4.*
- **Add `frontend/src/lib/stream.ts`** — an EventSource/fetch-stream client that consumes events and pushes them into React state; `frontend/src/lib/api.ts` keeps `runDemo()` for replay mode. *Depends on: 0.4.*
- **Build the streaming `ActivityFeed` shell** — renders events line-by-line as they arrive (append-only), handles the `done` event to hydrate the existing sections. *Depends on: 0.4.*
- **Deliverable:** clicking the button opens a stream and the feed paints stub events live, end to end, before any agent is real.

**Phase 1 dependencies:** Dev A's `gemini_client` is needed by Phase 2 negotiation/judging — but within Phase 1 the three workstreams are independent (A=LLM+extraction, B=data+clustering, C=transport). Integrate Phase 1 on `staging-demo` before Phase 2.

---

## 6. Phase 2 — Agent Architecture Upgrade (≈3–4 h, mostly parallel)

Goal: the judging agent and modular negotiation agent generate real reasoning and dialogue through `gemini_client`, driven by clusters, emitting the frozen events.

### 6.1 Nested data shape (reference, frozen in Phase 0)
```
merchants: [
  { seller_id, seller_name, negotiation_style, region, reliability_score,
    inventories: [
      { inventory_id, location,
        products: [ { product, length_mm, power_watts, price_eur,
                      delivery_days, warranty_years, availability } ] } ] } ]
```

### Dev B — Judging Agent  *(new)*
- **Create `backend/agents/judging_agent.py`** — `judge_candidates(requirements, clusters) -> list[JudgedCandidate]`.
  - For each candidate cluster/product: classify **good / borderline / bad**.
  - Use `gemini_client.generate(json_mode=True)` to produce the **reasoning for *why*** something is bad/borderline — not just a flag. Deterministic spec deltas are passed in so the LLM explains against real numbers (LLM augments judgment; Python still owns hard pass/fail later).
  - Sits **above** the negotiation layer: only good/borderline candidates proceed to negotiation; the judge's verdict + reasoning is emitted as `cluster`/judge events and stored.
- *Depends on: `product_clustering.py` (Dev B, Phase 1) + `gemini_client` (Dev A, Phase 1).*
- **Deliverable:** every candidate carries an LLM-written rationale; bad ones are explained.

### Dev A — Modular Negotiation Agent  *(refactor)*
- **Refactor `buyer_agent.py` + `seller_agent.py` → `backend/agents/negotiation_agent.py`.** Delete all hardcoded f-string dialogue. Each turn's text is generated by `gemini_client` from: requirements, the candidate, and the seller persona (`negotiation_style`/`reliability_score` from registry).
- **Sub-agents** under `backend/agents/negotiation/`: `price.py`, `delivery.py`, `warranty.py`, `risk.py`. Each owns one negotiation dimension and contributes its angle to the prompt for the turn.
- **Removable per deal type:** the negotiation agent takes an enabled-subagent set (e.g. one-time-use product drops `warranty.py`). Removing sub-agents changes negotiation posture (aggressive / flexible). Make the enabled set a parameter on the run.
- **Guardrails ("god rails")** in `backend/agents/negotiation/guardrails.py`: constrain what the agent may say/concede (no off-topic output; no concession past deterministic budget/constraint floors). Applied as system-prompt constraints **and** a post-generation check before a turn is emitted.
- Each generated turn emits a `negotiation_turn` event (the streaming feed paints it live).
- *Depends on: `gemini_client` (Phase 1) + frozen event schema. Independent of Dev B's judge file (different files) — integrate via the orchestrator.*
- **Deliverable:** live, non-presettable negotiation dialogue, dimension-aware, guardrailed.

### Dev C — Orchestrator wiring as event emitter
- **Upgrade `backend/orchestrator.py`** to the sequential flow **cluster → judge → negotiate → validate → escalate → audit**, emitting a frozen event at each stage instead of building one dict silently. Keep `run_demo()` as the non-streaming wrapper that drains the same generator into the legacy `DemoResult` (replay mode + existing `/api/run-demo`).
- **Move the Tavily shape adaptation into `run_demo`/the event emitter.** Today `api.py::_adapt_tavily()` reshapes `{source,results,query}` → the `{triggered,reason,results:[{title,snippet,source}]}` that `TavilyCard` expects, but only inside the `/api/run-demo` endpoint. The streamed `done` event carries the orchestrator's raw object, so the stream path would feed `TavilyCard` an unadapted shape and break it. Adapt inside the emitter so **both** paths emit the frontend shape.
- Pioneer labeling stays as a post-hoc tag on each generated seller turn (existing fallback logic).
- *Depends on: judging + negotiation interfaces from Dev A/B — coordinate signatures early; orchestrator is the integration seam, so Dev C consumes both. Stub the two agents behind their signatures so this can start before they finish.*
- **Deliverable:** one streamed run flows cluster→audit with real LLM stages, terminating in a `done` event carrying the full result.

**Phase 2 dependency note:** orchestrator (Dev C) consumes judge (Dev B) + negotiation (Dev A). Freeze those two function signatures at the top of Phase 2 so Dev C codes against stubs in parallel. Integrate on `staging-demo` at the end.

---

## 7. Phase 3 — Human-in-the-Loop + Real-Time UI (≈3–4 h, parallel)

### Dev C — Inline mid-process alert (PRIMARY HITL, must ship)
- **Backend:** when the flow hits a decision point (e.g. best valid offer over budget — reuse `human_escalation.py` triggers), emit a `human_alert` event and **pause the run** awaiting `POST /api/human-response`. *Depends on: streaming transport + orchestrator events.*
- **Frontend:** render the alert **inline in the ActivityFeed**; clicking opens an inline prompt/popup (approve / adjust); on submit, POST the response and the stream resumes. No page navigation.
- **Deliverable:** a real pause-for-human moment inside the live feed.

### Dev B — Email-based HITL (STRETCH, non-blocking)
- **`integrations/email_hitl.py`** — agent sends an email (Gemini AI Studio ↔ Gmail / dedicated temp demo account) when review is needed, polls for the reply, parses it, resumes. No login system.
- **Explicitly off the critical path.** If unfinished, the inline alert (Dev C) is the working HITL and the demo is unaffected. Do not let email block integration.
- **Deliverable (if reached):** high-wow email approval loop; otherwise silently absent.

### Dev A — Agent-network lines + hover detail + three views
> **Seam:** Dev A restructures `page.tsx` into three views (relocating/wrapping `ActivityFeed`) while Dev C adds the inline-alert + human-response handler *inside* `ActivityFeed`. Different files = no merge conflict, but Dev A's wrapper must pass the props Dev C's alert needs. **Freeze the `ActivityFeed` prop interface — especially the human-response callback — at the top of Phase 3** so they integrate clean.
- **AgentNetwork (`@xyflow/react`):** animate **labeled edges** between agent nodes as `negotiation_turn`/stage events arrive; **hover an edge → popup** with that communication's detail (the message + Pioneer labels + extracted fields).
- **Three views, full orchestration shown to everyone (no complexity toggle):** *buyer view* (clean request + result), *orchestration view* (all agent comms — default/primary), *seller-inventory view* (available products from nested data).
- **Live/Replay banner** off the flipped `DEMO_MODE` flag; scenario selector populated from the rebuilt blueprints.
- *Depends on: streaming events (Phase 1/2). Independent of HITL files.*
- **Deliverable:** the orchestration view shows intelligence happening live, edge-by-edge, hoverable.

---

## 8. Phase 4 — Integration + Polish (≈2 h)

- **Merge** all three feature branches into `staging-demo`; run one full live streamed pass per blueprint scenario. (Owner: Dev C drives merge; all test.)
- **Save a replay transcript** per scenario so `DEMO_MODE`/Replay mode reproduces a real LLM run for the CTO-facing demo (Owner: Dev A).
- **Refresh fallback assets** (`assets/fal_deal_card.png`) and the Aikido note (Owner: Dev B).
- **Compress/clean the UI** — remove dead mock data paths, tighten spacing; do **not** add new visual surface (reviewer: this is not the priority). (Owner: Dev A)
- **Pitch prep:** one-button → live extraction → clustering → judged candidates → live negotiation → inline human approval → recommendation. Core line: *"not one agent calling tools — a modular, human-in-the-loop orchestration layer where the negotiation is generated live."* (Owner: all)
- **Promote stable `staging-demo` → `main`** only after a clean full run. Run the demo from `main`.

---

## 9. Dependency Map

| Phase | Dev A (llm-core) | Dev B (agent-arch) | Dev C (realtime-ui) | Cross-blocks |
|-------|------------------|--------------------|--------------------| -------------|
| **0** | Gemini decision + key (0.2), DEMO_MODE flip (0.5) | Nested data schema (0.3) | Streaming event schema (0.4) | **All of Phase 0 blocks all of Phase 1.** |
| **1** | gemini_client + live extraction | data restructure + clustering | streaming transport (stub) | A's gemini_client blocks B & A in Phase 2. B's clustering blocks B's judge. C's event schema blocks all UI. |
| **2** | negotiation_agent + sub-agents + guardrails | judging_agent | orchestrator event-emitter | C (orchestrator) consumes A (negotiation) + B (judge) → freeze their signatures first; C codes vs stubs. |
| **3** | network lines + hover + 3 views | email HITL (stretch) | inline alert (primary HITL) | C's inline alert needs C's orchestrator pause hook (Phase 2). A's views need events (Phase 1/2). **Freeze `ActivityFeed` prop interface (human-response callback) first** — A wraps it, C fills it. B's email is non-blocking. |
| **4** | replay transcripts + UI compress | fallback assets + Aikido | merge + full-run test | Phase 4 needs 1–3 integrated on staging-demo. |

**Critical path:** Phase 0 → gemini_client (A) → negotiation_agent (A) + judging_agent (B) → orchestrator events (C) → inline HITL (C). Email HITL and the fal/Tavily side tracks are off it.

---

## 10. API Contracts That Change

**New transport (additive — old route stays):**
- **New:** `GET /api/run-demo/stream` (SSE) emitting the frozen event envelope; `POST /api/human-response` for mid-flow human replies.
- **Kept:** `POST /api/run-demo` (non-streaming, drains the same generator → `DemoResult`) and `GET /api/scenarios`.
- Frontend: `api.ts::runDemo()` stays for replay; **new** `stream.ts` consumes the SSE feed; `ActivityFeed` becomes append-on-event.

**`DemoResult` keys — meaning changes, shape mostly stable:**
- `conversation_logs[]` — *same shape*, but `message` is now **LLM-generated** per turn (not templated). Still carries `pioneer_labels` / `risk_level`. **No frontend change needed.**
- `structured_requirements` — *same shape*, now LLM-extracted. **No frontend change.**
- `matched_suppliers[]` — derived from **clusters now**, not BM25; same keys (`seller_id`, `seller_name`, `match_score`, `reason`). Keep keys stable so `SupplierGrid` survives.
- **NEW keys (additive — frontend opts in):**
  - `clusters[]` — candidate clusters with spec-similarity grouping (seller-inventory view).
  - `judged_candidates[]` — per-candidate `verdict` (good/borderline/bad) + LLM `reason` (for the orchestration view / judging panel).
- `final_recommendation`, `validation_results`, `escalation_result`, `audit_summary` — **keys unchanged** (audit/recommendation text now LLM-written, same field).

**Frontend must add:** `stream.ts`; streaming `ActivityFeed`; inline-alert handling in the feed; hover-popup on `AgentNetwork` edges; three-view layout; live/replay banner; optional rendering of `clusters[]` and `judged_candidates[]`. Existing section components need **no breaking change**.

---

## 11. What Must NOT Change

- **Deterministic validation rules** — `length_mm`, `power_watts`, `price_eur`, `delivery_days`, `warranty_years` checks in `validate_offer()`. Python owns pass/fail. Gemini never overrides them.
- **Existing `DemoResult` keys the frontend already renders** — `request`, `structured_requirements`, `matched_suppliers`, `conversation_logs`, `validation_results`, `tavily_enrichment`, `escalation_result`, `audit_summary`, `final_recommendation`, `deal_card_path`, `demo_mode`. Keep names/shapes; only add new keys. This is what lets every existing section component survive the rewrite.
- **`POST /api/run-demo` and `GET /api/scenarios`** — stay working (streaming is additive, not a replacement).
- **`DEMO_MODE` flag exists** — but its **default flips to live** (§0.5). The flag and the replay path persist as the CTO-facing safety net.
- **Supabase-with-local-fallback pattern in `data_access.py`** — keep the pattern; table/file shapes change underneath it.
- **Pioneer / Tavily / fal as replay-able side tracks** with fallbacks — keep; they stay visible in the UI.
- **`streamlit_app.py`** — keep functional as legacy fallback; do not invest.

---

## 12. Quick Reference — File Ownership

| File | Phase | Owner |
|------|-------|-------|
| `integrations/gemini_client.py` (new) | 1 | Dev A |
| `procurement_intelligence.py` (rewrite extract, keep validate) | 1 | Dev A |
| `data/seller_inventory.json` (restructure) + `data_access.py` | 1 | Dev B |
| `data/buyer_scenarios.json` → blueprints | 1 | Dev B |
| `backend/agents/product_clustering.py` (new) | 1 | Dev B |
| `backend/api.py` streaming + `frontend/src/lib/stream.ts` + `ActivityFeed` | 1 | Dev C |
| `backend/agents/judging_agent.py` (new) | 2 | Dev B |
| `backend/agents/negotiation_agent.py` + `negotiation/{price,delivery,warranty,risk,guardrails}.py` (new, replaces buyer_agent/seller_agent) | 2 | Dev A |
| `backend/orchestrator.py` (event emitter) | 2 | Dev C |
| Inline HITL (api pause + feed alert) | 3 | Dev C |
| `integrations/email_hitl.py` (new, stretch) | 3 | Dev B |
| `AgentNetwork` edges/hover + three views + banner | 3 | Dev A |

---

*End of plan. Settle the four Phase-0 contracts before splitting; the streaming event schema is the linchpin that makes the dependency map hold.*
