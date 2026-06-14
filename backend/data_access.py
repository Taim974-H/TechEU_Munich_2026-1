import json
import os
from dotenv import load_dotenv

load_dotenv()
from backend.config import get_env_url, get_env_str

SUPABASE_URL = get_env_url("SUPABASE_URL", "")
SUPABASE_ANON_KEY = get_env_str("SUPABASE_ANON_KEY", "")

_DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    # Demo escape hatch: force pure-local mode when Supabase is degraded.
    if os.getenv("SUPABASE_SKIP", "").lower() in ("1", "true", "yes"):
        return None
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None
    try:
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        return _client
    except Exception:
        return None


def _load_local(filename: str) -> list:
    path = os.path.join(_DATA_DIR, filename)
    try:
        with open(os.path.abspath(path)) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _load_local_dict(filename: str) -> dict:
    path = os.path.join(_DATA_DIR, filename)
    try:
        with open(os.path.abspath(path)) as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


_PAGE_SIZE = 1000


def _fetch(table: str, fallback_file: str) -> list:
    client = _get_client()
    if client is None:
        return _load_local(fallback_file)
    try:
        response = client.table(table).select("*").execute()
        return response.data or _load_local(fallback_file)
    except Exception:
        return _load_local(fallback_file)


def _fetch_all(table: str, fallback_file: str, max_rows: int = 10_000) -> list:
    """Paginated fetch for large tables. Falls back to local JSON on error."""
    client = _get_client()
    if client is None:
        return _load_local(fallback_file)
    rows: list = []
    offset = 0
    try:
        while offset < max_rows:
            res = client.table(table).select("*").range(offset, offset + _PAGE_SIZE - 1).execute()
            batch = res.data or []
            rows.extend(batch)
            if len(batch) < _PAGE_SIZE:
                break
            offset += _PAGE_SIZE
        return rows or _load_local(fallback_file)
    except Exception:
        return rows or _load_local(fallback_file)


def get_seller_registry() -> list:
    """Seller registry from Supabase (paginated), falls back to local JSON."""
    return _fetch_all("seller_registry", "seller_registry.json", max_rows=200_000)


def get_seller_inventory_nested() -> dict:
    """Returns the full nested merchants→inventories→products structure.
    Tries Supabase seller_inventory first; falls back to local JSON."""
    client = _get_client()
    if client is not None:
        try:
            res = client.table("seller_inventory").select("*").execute()
            if res.data:
                merchants_map: dict[str, dict] = {}
                for row in res.data:
                    sid = row.get("seller_id", "")
                    if sid not in merchants_map:
                        merchants_map[sid] = {
                            "seller_id": sid,
                            "seller_name": row.get("seller_name", ""),
                            "inventories": [{"products": []}],
                        }
                    merchants_map[sid]["inventories"][0]["products"].append(row)
                return {"merchants": list(merchants_map.values())}
        except Exception:
            pass
    return _load_local_dict("seller_inventory.json")


_CATEGORY_MAP: dict[str, list[str]] = {
    "electronics": ["gpu", "graphics", "rtx", "radeon", "electronic", "computer", "laptop", "server", "processor", "cpu", "ram", "ssd"],
    "chair": ["chair", "seat", "seating", "ergonomic", "furniture", "stool", "desk"],
    "general": [],  # catch-all
}


def _requirements_to_category(requirements: dict) -> str | None:
    haystack = " ".join([
        str(requirements.get("product_type", "")),
        str(requirements.get("use_case", "")),
        " ".join(str(k) for k in requirements.get("product_keywords", [])),
    ]).lower()
    for category, keywords in _CATEGORY_MAP.items():
        if category == "general":
            continue
        if any(kw in haystack for kw in keywords):
            return category
    return "general"


_catalog_cache: dict[tuple[str, int], list[dict]] = {}


def get_products_for_requirements(requirements: dict, limit: int = 200) -> list[dict]:
    """Query seller_inventory_products filtered by category, then merge with demo seller_inventory.

    Never loads the full catalog — always filtered + limited.
    Results (including failures) are cached per (category, limit) for the lifetime of
    the process so a transient Supabase error doesn't slow every subsequent request.
    """
    # Always include the 25 curated demo products
    demo_products = get_all_products_flat()

    # Local-only read mode for demo safety when Supabase is degraded.
    if os.getenv("LOCAL_ONLY_READS", "").lower() in ("1", "true", "yes"):
        return demo_products

    client = _get_client()
    if client is None:
        return demo_products

    category = _requirements_to_category(requirements) or "general"
    cache_key = (category, limit)
    if cache_key in _catalog_cache:
        catalog_products = _catalog_cache[cache_key]
    else:
        try:
            q = client.table("seller_inventory_products").select(
                "id,seller_id,seller_name,product,category,price_eur,delivery_days,"
                "warranty_years,availability,product_keywords,length_mm,power_watts"
            )
            if category and category != "general":
                q = q.eq("category", category)
            res = q.limit(limit).execute()
            catalog_products = res.data or []
        except Exception:
            # Cache the empty result so we don't retry the failing query on every call.
            catalog_products = []
        _catalog_cache[cache_key] = catalog_products

    # Merge: demo products first (they have richer specs), then catalog
    seen_ids = {p.get("id") for p in demo_products}
    merged = list(demo_products)
    for p in catalog_products:
        if p.get("id") not in seen_ids:
            merged.append(p)
    return merged


_products_flat_cache: list[dict] | None = None
_registry_cache: dict[str, dict] = {}


def get_all_products_flat() -> list[dict]:
    """Flat product list from seller_inventory (demo curated, 25 rows). Use get_products_for_requirements() for live buyer matching."""
    global _products_flat_cache
    if _products_flat_cache is not None:
        return _products_flat_cache

    client = _get_client()
    if client is not None:
        try:
            res = client.table("seller_inventory").select("*").execute()
            if res.data:
                _products_flat_cache = res.data
                return _products_flat_cache
        except Exception:
            pass
    # Local fallback: flatten nested JSON
    nested = get_seller_inventory_nested()
    products: list[dict] = []
    for merchant in nested.get("merchants", []):
        seller_id = merchant.get("seller_id", "")
        seller_name = merchant.get("seller_name", "")
        for inventory in merchant.get("inventories", []):
            for product in inventory.get("products", []):
                flat = dict(product)
                flat["seller_id"] = seller_id
                flat["seller_name"] = seller_name
                products.append(flat)
    _products_flat_cache = products
    return products


def get_seller_inventory() -> list:
    """Flat product list for backward-compat consumers (supplier_matching, negotiation_agent)."""
    return get_all_products_flat()


def get_registry_for_sellers(seller_ids: list[str]) -> list[dict]:
    """Fetch registry entries only for the given seller_ids. Much faster than loading all 112K."""
    if not seller_ids:
        return []

    # Serve cached entries; only query Supabase for the missing seller_ids
    missing = [sid for sid in seller_ids if sid not in _registry_cache]
    if missing:
        client = _get_client()
        if client is not None:
            try:
                res = client.table("seller_registry").select("*").in_("seller_id", missing).execute()
                for row in (res.data or []):
                    _registry_cache[row["seller_id"]] = row
            except Exception:
                pass

    return [_registry_cache[sid] for sid in seller_ids if sid in _registry_cache]


def get_buyer_scenarios() -> list:
    return _fetch("buyer_scenarios", "buyer_scenarios.json")


def prewarm_caches() -> None:
    """Pull Supabase data into in-memory caches at boot so the first user demo is fast."""
    get_all_products_flat()
    for category_hint in ("electronics", "chair", "general"):
        get_products_for_requirements({"product_type": category_hint})
    get_registry_for_sellers([
        "vendor_a", "vendor_b", "vendor_c", "vendor_d", "vendor_e", "vendor_f", "vendor_g",
    ])


def write_demo_session(session_id: str, result: dict) -> None:
    """Write a completed DemoResult to Supabase for the seller Realtime dashboard."""
    client = _get_client()
    if not client:
        return
    # Enrich matched_suppliers with registry fields the frontend MatchedSupplier type expects
    registry = {s["seller_id"]: s for s in get_seller_registry()}
    for supplier in result.get("matched_suppliers", []):
        reg = registry.get(supplier.get("seller_id", ""), {})
        supplier.setdefault("specialization", reg.get("specialization", ""))
        supplier.setdefault("region", reg.get("region", ""))
        supplier.setdefault("reliability_score", reg.get("reliability_score", 0.0))
        supplier.setdefault("negotiation_style", reg.get("negotiation_style", "standard"))
    try:
        # Delete any prior row for this session so the INSERT always fires a
        # Realtime event (the seller dashboard subscribes to INSERT, not UPDATE).
        client.table("demo_sessions").delete().eq("session_id", session_id).execute()
        client.table("demo_sessions").insert({
            "session_id": session_id,
            "result": result,
        }).execute()
    except Exception:
        pass
