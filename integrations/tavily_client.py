import os
import re
from urllib.parse import urlparse, urlunparse
from integrations.fallback_outputs import fallback_tavily_result

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
TIMEOUT = 10


def search_external_supplier(requirements: dict) -> dict:
    if not TAVILY_API_KEY:
        return fallback_tavily_result(requirements)

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=TAVILY_API_KEY)
        product_type = requirements.get("product_type", "product")
        use_case = requirements.get("use_case", "business use")
        budget = requirements.get("budget_eur", 650)
        query = (
            f"{product_type} for {use_case} under €{budget} supplier Europe"
        )
        result = client.search(query=query, max_results=3)
        return {"source": "tavily", "results": result.get("results", []), "query": query}
    except Exception:
        return fallback_tavily_result(requirements)


def build_validated_url(base_url: str) -> str:
    try:
        # Minimal path validation
        if "/../" in base_url or re.search(r"/%2e%2e/", base_url, re.IGNORECASE):
            raise ValueError("Invalid path")
        
        parsed = urlparse(base_url)
        
        # Protocol + host checks
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Invalid protocol")
        if not parsed.hostname:
            raise ValueError("Invalid host")
        allowed_domains = ["example.com"]  # add your allowed domains here
        if parsed.hostname.lower() not in allowed_domains:
            raise ValueError("Invalid host")
        
        return urlunparse(parsed)
    except Exception:
        raise ValueError("Invalid URL")


def fetch_supplier_url(url: str) -> dict:
    """Fetch a supplier-provided spec sheet or product page for enrichment."""
    import requests
    validated_url = build_validated_url(url)
    resp = requests.get(validated_url, timeout=TIMEOUT)
    return {"url": url, "status_code": resp.status_code, "content": resp.text[:5000]}
