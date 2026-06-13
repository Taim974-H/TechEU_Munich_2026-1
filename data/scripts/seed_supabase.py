"""Seed the Pactum Supabase project with synthetic procurement data.

Usage:
    python -m data.scripts.seed_supabase

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
(e.g. via a .env file). The service role key is required because this
script writes to tables that should not be writable by the anon key.

Before running this script, apply supabase/schema.sql to your Supabase
project (SQL editor or `supabase db push`).
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

DATA_DIR = Path(__file__).resolve().parent.parent


def load_json(filename: str) -> list[dict]:
    with open(DATA_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


def seed_table(client, table: str, filename: str, conflict_col: str) -> None:
    rows = load_json(filename)
    if not rows:
        print(f"  - {table}: no rows in {filename}, skipping")
        return
    client.table(table).upsert(rows, on_conflict=conflict_col).execute()
    print(f"  - {table}: upserted {len(rows)} rows from {filename}")


def main() -> None:
    load_dotenv()

    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    client = create_client(url, key)

    print("Seeding Supabase tables...")
    seed_table(client, "buyer_scenarios", "buyer_scenarios.json", "request_id")
    seed_table(client, "seller_registry", "seller_registry.json", "seller_id")
    seed_table(client, "seller_inventory", "seller_inventory.json", "id")
    seed_table(client, "conversation_logs", "synthetic_negotiations.json", "id")
    seed_table(client, "validation_results", "validation_results.json", "id")
    seed_table(client, "escalation_results", "escalation_results.json", "id")
    seed_table(client, "audit_summaries", "audit_summaries.json", "id")
    seed_table(client, "final_recommendations", "final_recommendations.json", "id")
    seed_table(client, "pioneer_inference_examples", "pioneer_inference_examples.json", "id")
    seed_table(client, "tavily_fallback_results", "tavily_fallback_results.json", "id")
    seed_table(client, "edge_cases", "edge_cases.json", "id")
    print("Done.")


if __name__ == "__main__":
    main()
