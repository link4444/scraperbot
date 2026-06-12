import logging
import os
from datetime import datetime, timezone

import httpx
from sqlmodel import Session
from app.database import engine
from app.models import SystemSetting

logger = logging.getLogger(__name__)


def get_discord_webhook_url() -> str | None:
    """Retrieve the Discord Webhook URL from the database or fall back to environment variables."""
    try:
        with Session(engine) as session:
            setting = session.get(SystemSetting, "discord_webhook_url")
            if setting and setting.value:
                return setting.value
    except Exception as e:
        logger.error("Failed to fetch discord_webhook_url from database: %s", e)
    return os.getenv("DISCORD_WEBHOOK_URL")


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
    webhook_url = get_discord_webhook_url()
    if not webhook_url:
        logger.warning("DISCORD_WEBHOOK_URL is not set — skipping alert.")
        return False

    # Calculate discount percentage
    discount_pct = (
        ((target_price - current_price) / target_price) * 100
        if target_price > 0
        else 0.0
    )

    symbol = getattr(product, "currency_symbol", "£")

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
                        "value": f"{symbol}{current_price:.2f}",
                        "inline": True,
                    },
                    {
                        "name": "Target Price",
                        "value": f"{symbol}{target_price:.2f}",
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
            resp = await client.post(webhook_url, json=payload)
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

