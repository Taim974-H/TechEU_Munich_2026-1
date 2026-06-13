"""FastAPI bridge exposing the Pactum backend to the Next.js frontend.

Usage:
    uvicorn backend.api:app --reload --port 8000
"""

from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.data_access import get_buyer_scenarios
from backend.orchestrator import run_demo

app = FastAPI(title="Pactum API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BuyerRequestIn(BaseModel):
    raw_request: str
    region: str
    priority: str
    request_id: Optional[str] = None


def _adapt_tavily(tavily_raw: dict) -> dict:
    results = tavily_raw.get("results", [])
    return {
        "triggered": bool(results),
        "reason": tavily_raw.get("query", ""),
        "results": [
            {
                "title": r.get("title", ""),
                "snippet": r.get("content", ""),
                "source": r.get("url", ""),
            }
            for r in results
        ],
    }


@app.get("/api/scenarios")
def scenarios() -> list:
    return get_buyer_scenarios()


@app.post("/api/run-demo")
def run_demo_endpoint(request: BuyerRequestIn) -> dict:
    payload = request.model_dump(exclude_none=True)
    result = run_demo(payload)
    result["tavily_enrichment"] = _adapt_tavily(result.get("tavily_enrichment") or {})
    return result
