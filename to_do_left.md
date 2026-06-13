# Pactum — To-Do Left

Action list of confirmed gaps between the current working demo and a judge-ready presentation. The full end-to-end flow already works (buyer request → requirements → match → negotiation → validation → escalation → audit → recommendation), all 6 agents are implemented, both UIs (Next.js primary, Streamlit legacy) are wired, and `DEMO_MODE=true` runs with no API keys. Everything below is what remains.

Items are ordered by priority. Each one is self-contained — pick any and implement without further investigation.

---

## HIGH — breaks demo beats

### H1. Backend never attaches `extracted_fields` to conversation logs
**Where:** `backend/orchestrator.py` lines 44–46.
**Broken:** Each seller log gets `log["pioneer_labels"]` and `log["risk_level"]` assigned, but never `log["extracted_fields"]`. The Next.js `emitStageEnd` in `demoMachine.ts` reads `log.extracted_fields` to render the Pioneer feed line "Labeled: price_concession · price: 650 · delivery: 5". In live runs `log.extracted_fields` is always `undefined` — only `mockData.ts` has it. This silently kills the headline Pioneer demo beat.
**Fix:** `fallback_pioneer_labels()` in `integrations/fallback_outputs.py` already returns `extracted_fields` (line 40) inside `label_result`. In `orchestrator.py`, right after line 45, add:
```python
log["extracted_fields"] = label_result.get("extracted_fields", {})
```
No other change needed — the data is already in `label_result`.

### H2. `assets/fal_deal_card.png` does not exist
**Where:** `integrations/fallback_outputs.py` line 59 returns this path; `assets/` contains only the `screenshots/` dir.
**Broken:** Streamlit guards with `os.path.exists(deal_card)` and silently skips the deal-card section when the file is missing. (Next.js is unaffected — it renders the custom `DealCard` component, not this file.)
**Fix:** Place a real PNG at `assets/fal_deal_card.png`. Either (a) run fal once with a key and save the output, or (b) export the Next.js `DealCard` as a static PNG, or (c) drop in a clearly-styled placeholder card image. Any valid PNG at that path unblocks the Streamlit deal-card render.

### H3. No scenario selector in the Next.js RequestForm
**Where:** `frontend/src/components/RequestForm.tsx` (no dropdown present); `frontend/src/lib/api.ts` exports `getScenarios()` but it's never called; FastAPI `/api/scenarios` endpoint already works.
**Broken:** `defaultRequest` is hardcoded to REQ-001 ("We need a GPU…"). Judges cannot switch to REQ-002 (computer vision workstation) or REQ-003 (data processing server) to show that the system handles different requirement profiles.
**Fix:** In `RequestForm.tsx`, call `getScenarios()` on mount, populate a `<select>` dropdown with the returned scenarios, and on change set the form's request text/`request_id` to the selected scenario. Keep a "Custom" option that allows free-text entry (current behavior). Pass the selected `request_id` through to `/api/run-demo` so the backend uses canonical requirements.

### H4. Aikido scan screenshot missing
**Where:** `security/aikido_notes.md` claims "Aikido screenshot saved in assets/screenshots/"; that dir contains only `.gitkeep`.
**Broken:** Aikido is a pitch side track with no visual proof. The claim in the notes is currently false.
**Fix:** Run an Aikido scan and save the result screenshot to `assets/screenshots/aikido_scan.png`, OR save a clearly-labelled placeholder there and soften the wording in `aikido_notes.md` to match what actually exists. Do not leave the notes claiming an asset that isn't present.

---

## MEDIUM — polish / pitch completeness

### M1. Streamlit never displays Tavily enrichment
**Where:** `streamlit_app.py` (no reference to `tavily_enrichment`).
**Broken:** Streamlit renders requirements, suppliers, negotiation, validation, escalation, audit, and recommendation — but the Tavily side track is invisible. (Next.js `TavilyCard` already handles this.)
**Fix:** Add a section in `streamlit_app.py` that renders `result["tavily_enrichment"]` — supplier/spec enrichment fields in an expander or card, gated on the dict being non-empty.

### M2. No demo-mode banner in Next.js
**Where:** `frontend/src/app/page.tsx` (no demo-mode indicator). Streamlit shows `st.info("Running in DEMO_MODE — using saved fallback outputs.")`.
**Broken:** Judges watching the Next.js demo have no signal that outputs are deterministic fallbacks rather than live API calls.
**Fix:** Surface `demo_mode` from the `/api/run-demo` result (already in the result object) in `page.tsx` and render a small banner/pill (e.g. "Deterministic replay mode — saved fallback outputs") when true.

### M3. Next.js never surfaces `deal_card_path` / real fal image
**Where:** `backend/orchestrator.py` returns `deal_card_path`; `frontend/src/app/page.tsx` never reads it.
**Broken:** The custom `DealCard` component is fine for the demo, but if fal generates a real image during a live run, it's invisible. The pitch says "fal generates a visual deal card."
**Fix:** In `page.tsx`/`FinalRecommendation`, read `result.deal_card_path`. If it points to a real generated image (not the static fallback), display it alongside or instead of the custom `DealCard`. Keep `DealCard` as the fallback when no real image is present.

### M4. Pioneer `extracted_fields` not shown inline in Streamlit
**Where:** `streamlit_app.py` Pioneer feed shows `pioneer_labels` and `risk_level` only.
**Broken:** The extracted price/delivery values aren't shown inline. Minor — Next.js handles this well (and depends on H1).
**Fix:** After H1 lands, render `log["extracted_fields"]` inline next to the labels in the Streamlit negotiation/Pioneer section.

### M5. `NEXT_PUBLIC_API_URL` undocumented
**Where:** `frontend/src/lib/api.ts` reads `process.env.NEXT_PUBLIC_API_URL`; no `.env.local.example` exists in `frontend/`.
**Broken:** Defaults to `localhost:8000` which works locally, but there's no documented setup step for a developer on a fresh checkout.
**Fix:** Add `frontend/.env.local.example` containing `NEXT_PUBLIC_API_URL=http://localhost:8000` and reference it in the README run instructions (see P2).

---

## LOW — live-API mode only (irrelevant under `DEMO_MODE=true`)

### L1. Pioneer endpoint shape unverified
**Where:** `integrations/pioneer_client.py` POSTs to `{PIONEER_BASE_URL}/classify` with `{"message": message}`.
**Risk:** Pioneer's real endpoint/payload spec may differ. Only matters when `PIONEER_API_KEY` is set. Verify against Pioneer docs before any live run; otherwise leave as-is (fallback path is correct).

### L2. Tavily live-trigger condition can't fire in demo mode
**Where:** orchestrator condition `len(matched_suppliers) < 2 and not demo_mode`.
**Risk:** In demo mode Tavily is never live-triggered; the saved fallback is always used. Intentional, but the "Tavily was triggered" pitch moment is scripted. With a real Tavily key and a tight-match scenario this works correctly. No change required unless doing a live Tavily run.

### L3. Sellers negotiated sequentially, not in parallel
**Where:** orchestrator loops sellers one at a time.
**Risk:** Architecture doc implies parallel seller handling. Fine for a demo. Defer — not worth the refactor risk during the hackathon.

---

## PITCH READINESS — docs & narrative

### P1. `CLAUDE.md` status is stale
**Broken:** Still says "Do not add FastAPI unless explicitly needed," but FastAPI (`backend/api.py`) is now the central bridge. The status table omits `backend/api.py`, `backend/data_access.py`, and the entire Next.js `frontend/`.
**Fix:** Update the architecture/tech-stack/status sections to reflect: Next.js (primary UI) → FastAPI (`backend/api.py`) → orchestrator; Streamlit as legacy; Supabase via `data_access.py`. Add the new files to the implementation-status table.

### P2. README run instructions incomplete
**Broken:** No clear two-process start sequence.
**Fix:** Document: (1) start backend — `uvicorn backend.api:app --reload --port 8000`; (2) start frontend — `cd frontend && npm install && npm run dev`; (3) note `DEMO_MODE=true` is default and needs no keys; (4) reference `frontend/.env.local.example`. Keep the legacy `streamlit run streamlit_app.py` path documented separately.

### P3. Decide the live-vs-replay key story
**Broken:** The pitch implies Pioneer/Tavily/fal run live, but under `DEMO_MODE=true` everything is fallback.
**Fix:** Make one decision and align the pitch to it:
- **Option A (safer):** Label the demo "deterministic replay mode" — honest, reliable, no key risk. Update banner (M2) and pitch copy to match.
- **Option B (riskier):** Obtain real keys, do one live run per side track (Pioneer classify, Tavily enrich, fal card), keep `DEMO_MODE=true` as the fallback safety net.
Recommend Option A for the judged run with Option B as an optional "and here it is live" flourish if keys are stable.

---

## Recommended order of attack

1. **H1** — one-line orchestrator fix; restores the headline Pioneer "extracted fields" beat. (5 min)
2. **H3** — Next.js scenario selector; lets judges show 3 distinct flows. (30–45 min)
3. **H2** — drop in `assets/fal_deal_card.png`; unblocks the Streamlit deal card. (15 min)
4. **H4** — Aikido screenshot or labelled placeholder + reconcile `aikido_notes.md`. (15 min)
5. **M2** — demo-mode banner in Next.js; sets honest expectations for judges. (15 min)
6. **P3** — lock the live-vs-replay decision now, because it shapes the pitch and M2/M3 copy. (decision, 5 min)
7. **M1** — Tavily card in Streamlit (only if Streamlit is part of the shown demo). (20 min)
8. **M3** — surface real fal image in Next.js (pairs with Option B of P3). (20 min)
9. **P1 + P2** — refresh `CLAUDE.md` and README. (30 min)
10. **M4, M5** — small polish; do if time remains. (15 min)
11. **L1–L3** — only if attempting a live API run; otherwise skip for the hackathon.
