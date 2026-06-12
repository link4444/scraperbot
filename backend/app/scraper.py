"""
Web scraper with httpx (fast) and Playwright (fallback).

This module provides async functions to scrape product pages on
books.toscrape.com. The primary scraper uses httpx + regex for speed;
if that fails, a headless Playwright browser is used as a fallback.
"""

import logging
import re
import asyncio
from typing import Optional

import httpx
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


# ---------------------------------------------------------------------------
# httpx + regex scraper (PRIMARY — fast, no browser overhead)
# ---------------------------------------------------------------------------
async def scrape_book_httpx(url: str) -> Optional[dict]:
    """
    Scrape a book page using httpx and regex parsing.

    This is the fast, lightweight scraper that works well for static HTML
    pages like books.toscrape.com. No browser is launched.

    Args:
        url: Full URL of the book detail page.

    Returns:
        A dict with keys ``title``, ``price``, ``image_url``,
        ``currency_symbol``, and ``currency_code``,
        or ``None`` if the scrape fails.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text

        # --- Title: first <h1>...</h1> tag ---
        title_match = re.search(r"<h1>(.*?)</h1>", html, re.DOTALL)
        title = title_match.group(1).strip() if title_match else "Unknown Title"

        # --- Price: <p class="price_color">£51.77</p> ---
        price_match = re.search(
            r'class="price_color"[^>]*>(.*?)</p>', html, re.DOTALL
        )
        price_raw = price_match.group(1).strip() if price_match else "£0.00"
        currency_symbol, currency_code = detect_currency(price_raw)
        numeric_match = re.search(r"[\d,]+\.?\d*", price_raw)
        price_str = numeric_match.group(0).replace(",", "") if numeric_match else "0"
        price = float(price_str)

        # --- Image: inside <div class="item active"> find <img src="..."> ---
        item_match = re.search(
            r'class="item active"[^>]*>(.*?)</div>', html, re.DOTALL
        )
        image_url = ""
        if item_match:
            img_match = re.search(r'<img\s[^>]*src="([^"]+)"', item_match.group(1))
            if img_match:
                src = img_match.group(1)
                image_url = (
                    url.split("/catalogue/")[0]
                    + "/"
                    + src.replace("../", "")
                )

        result = {
            "title": title,
            "price": price,
            "image_url": image_url,
            "currency_symbol": currency_symbol,
            "currency_code": currency_code,
        }
        logger.info(
            "httpx scraped '%s' — price: %s%.2f (%s)",
            result["title"],
            currency_symbol,
            price,
            currency_code,
        )
        return result

    except Exception:
        logger.exception("httpx scraper failed for URL: %s", url)
        return None


# ---------------------------------------------------------------------------
# Playwright scraper (FALLBACK — handles JS-rendered pages)
# ---------------------------------------------------------------------------
async def scrape_book_playwright(url: str) -> Optional[dict]:
    """
    Scrape a single book page using a headless Playwright browser.

    This is the heavyweight fallback used when the httpx scraper fails
    (e.g. for JavaScript-rendered content).

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
                "Playwright scraped '%s' — price: %s%.2f (%s)",
                result["title"],
                currency_symbol,
                price,
                currency_code,
            )
            return result

        except Exception:
            logger.exception("Playwright scraper failed for URL: %s", url)
            return None

        finally:
            await browser.close()


# ---------------------------------------------------------------------------
# Public API — tries httpx first, falls back to Playwright
# ---------------------------------------------------------------------------

import time

async def _fetch_coingecko_all(coin_id: str) -> Optional[dict]:
    """
    Fetch current price and historical data for a cryptocurrency.
    Uses DefiLlama's open API to completely bypass CoinGecko's aggressive
    Cloudflare blocking on Render IP addresses.
    """
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            now = int(time.time())
            
            # Fetch 30-day market history
            history_url = f"https://coins.llama.fi/chart/coingecko:{coin_id}?end={now}&span=30&period=1d"
            history_resp = await client.get(history_url)
            history_resp.raise_for_status()
            history_data = history_resp.json()
            
            # Extract prices and symbol
            coin_data = history_data.get("coins", {}).get(f"coingecko:{coin_id}", {})
            prices_raw = coin_data.get("prices", [])
            symbol = coin_data.get("symbol", coin_id.upper())
            
            # Convert to expected CoinGecko format: [[timestamp_ms, price], ...]
            raw_history = [[p["timestamp"] * 1000, p["price"]] for p in prices_raw]
            
            # Fetch precise current price
            curr_url = f"https://coins.llama.fi/prices/current/coingecko:{coin_id}"
            curr_resp = await client.get(curr_url)
            curr_resp.raise_for_status()
            curr_data = curr_resp.json()
            
            current_price_data = curr_data.get("coins", {}).get(f"coingecko:{coin_id}", {})
            current_price = current_price_data.get("price", raw_history[-1][1] if raw_history else 0)
            
            logger.info("Fetched %d historical data points for %s via DefiLlama", len(raw_history), coin_id)
            
            return {
                "title": f"{coin_id.capitalize()} (Crypto)",
                "price": float(current_price),
                "image_url": f"https://cryptologos.cc/logos/{coin_id}-{symbol.lower()}-logo.png",
                "currency_symbol": "$",
                "currency_code": "USD",
                "history": raw_history,
            }
    except Exception:
        logger.exception("DefiLlama API failed for coin: %s", coin_id)
        return None


# Keep for backwards compatibility / standalone use
async def fetch_coingecko_history(coin_id: str, days: int = 30) -> list:
    """Fetch real historical price data from CoinGecko. Returns list of [timestamp_ms, price]."""
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart?vs_currency=usd&days={days}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    try:
        async with httpx.AsyncClient(timeout=20, headers=headers) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return data.get("prices", [])
    except Exception:
        logger.exception("CoinGecko History API failed for coin: %s", coin_id)
        return []


async def scrape_book(url: str) -> Optional[dict]:
    """
    Scrape a product page.
    - CoinGecko URLs: fetches coin data + 30-day history via the API (no browser).
    - Everything else: tries fast httpx scraper first, falls back to Playwright.
    
    For CoinGecko results, the returned dict includes a 'history' key with
    raw [[timestamp_ms, price], ...] data for the caller to persist.
    """
    coingecko_match = re.search(r"coingecko\.com/en/coins/([a-zA-Z0-9-]+)", url)
    if coingecko_match:
        coin_id = coingecko_match.group(1)
        logger.info("Detected CoinGecko URL, fetching data+history for: %s", coin_id)
        return await _fetch_coingecko_all(coin_id)

    # Normal ecommerce scraping
    result = await scrape_book_httpx(url)
    if result is not None:
        return result

    logger.info("httpx scraper returned None — falling back to Playwright for %s", url)
    return await scrape_book_playwright(url)

