"""
Playwright-based web scraper.

This module provides async functions to launch a headless browser via
Playwright, navigate to product pages on books.toscrape.com, and extract
the current price, title, image URL, and currency symbol. It handles
timeouts and graceful browser lifecycle management.
"""

import logging
import re
from typing import Optional

from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Currency symbol → ISO code mapping
# ---------------------------------------------------------------------------
CURRENCY_SYMBOL_MAP: dict[str, str] = {
    "£": "GBP",
    "$": "USD",
    "€": "EUR",
    "¥": "JPY",
    "₹": "INR",
    "₩": "KRW",
    "₣": "CHF",
    "A$": "AUD",
    "C$": "CAD",
    "HK$": "HKD",
    "S$": "SGD",
    "NZ$": "NZD",
    "R$": "BRL",
    "₺": "TRY",
    "₴": "UAH",
    "₽": "RUB",
    "Rp": "IDR",
    "RM": "MYR",
    "฿": "THB",
    "₦": "NGN",
    "د.إ": "AED",
    "kr": "SEK",
    "zł": "PLN",
    "Kč": "CZK",
}

# Price regex: optional leading currency prefix, numeric value
# Captures: (currency_symbol, numeric_value)
PRICE_RE = re.compile(
    r"([£$€¥₹₩₣₺₴₽₦฿]|A\$|C\$|HK\$|S\$|NZ\$|R\$|Rp|RM|kr|zł|Kč|د\.إ)?\s*([\d,]+\.?\d*)",
    re.UNICODE,
)


def detect_currency(raw: str) -> tuple[str, str]:
    """
    Parse a raw price string and return (symbol, iso_code).

    Examples:
        "£51.77" → ("£", "GBP")
        "$19.99" → ("$", "USD")
        "19.99"  → ("", "UNKNOWN")
    """
    raw = raw.strip()
    m = PRICE_RE.search(raw)
    if not m:
        return ("", "UNKNOWN")
    symbol = (m.group(1) or "").strip()
    iso = CURRENCY_SYMBOL_MAP.get(symbol, "UNKNOWN" if not symbol else symbol)
    return (symbol, iso)


async def scrape_book(url: str) -> Optional[dict]:
    """
    Scrape a single book page from books.toscrape.com (or compatible sites).

    Detects the currency symbol from the displayed price and returns it
    alongside title, numeric price, and image URL.

    Args:
        url: Full URL of the book detail page.

    Returns:
        A dict with keys ``title``, ``price``, ``image_url``,
        ``currency_symbol``, and ``currency_code``,
        or ``None`` if the scrape fails.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        try:
            # Increased timeout to 30 s for slow / cold-start servers
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # --- Title ---
            title_el = await page.query_selector("h1")
            title = await title_el.inner_text() if title_el else "Unknown Title"

            # --- Price (with currency detection) ---
            price_el = await page.query_selector(".product_main .price_color")
            price_raw = await price_el.inner_text() if price_el else "£0.00"
            currency_symbol, currency_code = detect_currency(price_raw)
            price_match = re.search(r"[\d,]+\.?\d*", price_raw)
            price_str = price_match.group(0).replace(",", "") if price_match else "0"
            price = float(price_str)

            # --- Image ---
            image_el = await page.query_selector(".item.active img")
            image_src = await image_el.get_attribute("src") if image_el else ""
            if image_src:
                absolute_image_url = (
                    url.split("/catalogue/")[0]
                    + "/"
                    + image_src.replace("../", "")
                )
            else:
                absolute_image_url = ""

            result = {
                "title": title.strip(),
                "price": price,
                "image_url": absolute_image_url,
                "currency_symbol": currency_symbol,
                "currency_code": currency_code,
            }
            logger.info(
                "Scraped '%s' — price: %s%.2f (%s)",
                result["title"],
                currency_symbol,
                price,
                currency_code,
            )
            return result

        except Exception:
            logger.exception("Failed to scrape URL: %s", url)
            return None

        finally:
            await browser.close()
