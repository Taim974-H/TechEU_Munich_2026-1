"""Apply supabase/schema.sql to the Supabase Postgres database.

Usage:
    python -m data.scripts.apply_schema

Requires SUPABASE_DB_HOST, SUPABASE_DB_PORT, SUPABASE_DB_NAME,
SUPABASE_DB_USER, SUPABASE_DB_PASSWORD in the environment (e.g. via .env).
"""

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

SCHEMA_FILE = Path(__file__).resolve().parent.parent / "supabase" / "schema.sql"


def main() -> None:
    load_dotenv()

    conn = psycopg2.connect(
        host=os.environ["SUPABASE_DB_HOST"],
        port=os.environ["SUPABASE_DB_PORT"],
        dbname=os.environ["SUPABASE_DB_NAME"],
        user=os.environ["SUPABASE_DB_USER"],
        password=os.environ["SUPABASE_DB_PASSWORD"],
        sslmode="require",
    )
    try:
        with conn:
            with conn.cursor() as cur:
                sql = SCHEMA_FILE.read_text(encoding="utf-8")
                cur.execute(sql)
        print("Schema applied successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
