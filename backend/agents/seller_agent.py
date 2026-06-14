from __future__ import annotations

from typing import Any


def get_initial_offer(seller_id: str, inventory: list[dict[str, Any]]) -> dict[str, Any]:
    seller_items = [item for item in inventory if item["seller_id"] == seller_id]
    if not seller_items:
        raise ValueError(f"No inventory for seller_id={seller_id}")
    return sorted(seller_items, key=lambda item: (item["price_eur"], item["delivery_days"]))[0]


def seller_message(offer: dict[str, Any]) -> str:
    return (
        f"We can offer {offer['product']} for EUR {offer['price_eur']} with "
        f"{offer['delivery_days']} day delivery and {offer['warranty_years']} year warranty."
    )

