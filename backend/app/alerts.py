"""
Discord webhook alert dispatcher.

This module sends price-drop notifications to a Discord channel via
webhook using httpx. It formats alert messages with product details,
current/target prices, and percentage discount as a rich embed.
"""

import logging
import os
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

DISCORD_WEBHOOK_URL: str | None = os.getenv("DISCORD_WEBHOOK_URL")


async def send_discord_alert(
    product, current_price: float, target_price: float
) -> bool:
    """
    Send a price-drop embed to Discord.

    Args:
        product: The Product model instance (needs ``title``, ``url``,
                 ``image_url``).
        current_price: The newly scraped price.
        target_price: The user-defined threshold.

    Returns:
        True if the message was delivered successfully, False otherwise.
    """
    if not DISCORD_WEBHOOK_URL:
        logger.warning("DISCORD_WEBHOOK_URL is not set — skipping alert.")
        return False

    # Calculate discount percentage
    discount_pct = (
        ((target_price - current_price) / target_price) * 100
        if target_price > 0
        else 0.0
    )

    payload = {
        "embeds": [
            {
                "title": "🚨 Price Drop Alert!",
                "description": (
                    f"**[{product.title}]({product.url})** "
                    f"has dropped below your target price!"
                ),
                "color": 3066993,  # green
                "fields": [
                    {
                        "name": "Current Price",
                        "value": f"£{current_price:.2f}",
                        "inline": True,
                    },
                    {
                        "name": "Target Price",
                        "value": f"£{target_price:.2f}",
                        "inline": True,
                    },
                    {
                        "name": "Discount",
                        "value": f"{discount_pct:.1f}%",
                        "inline": True,
                    },
                ],
                "thumbnail": {"url": product.image_url or ""},
                "footer": {"text": "Price Monitor Bot"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(DISCORD_WEBHOOK_URL, json=payload)
            resp.raise_for_status()
        logger.info("Discord alert sent for '%s'", product.title)
        return True
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Discord webhook returned %s: %s",
            exc.response.status_code,
            exc.response.text,
        )
        return False
    except Exception:
        logger.exception("Failed to send Discord alert for '%s'", product.title)
        return False
