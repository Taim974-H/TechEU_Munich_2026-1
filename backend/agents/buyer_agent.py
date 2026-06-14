from __future__ import annotations

from typing import Any


def buyer_opening_message(requirements: dict[str, Any]) -> str:
    return (
        f"Buyer needs a {requirements['product_type']} for {requirements['use_case']} under "
        f"EUR {requirements['budget_eur']}, max {requirements['max_length_mm']} mm, "
        f"max {requirements['max_power_watts']} W, delivery within {requirements['max_delivery_days']} days."
    )


def negotiate_offer(requirements: dict[str, Any], offer: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, str]]]:
    logs = [{"speaker": "buyer_agent", "message": buyer_opening_message(requirements)}]
    adjusted = offer.copy()

    if adjusted["price_eur"] > requirements["budget_eur"] and adjusted["price_eur"] <= requirements["budget_eur"] + 30:
        logs.append(
            {
                "speaker": "buyer_agent",
                "message": f"Can you meet EUR {requirements['budget_eur']} including delivery?",
            }
        )
        adjusted["price_eur"] = requirements["budget_eur"]
        logs.append(
            {
                "speaker": adjusted["seller_id"],
                "message": f"We can reduce to EUR {adjusted['price_eur']} if delivery next week is acceptable.",
            }
        )

    return adjusted, logs

