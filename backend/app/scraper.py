"""
Playwright-based web scraper.

This module provides async functions to launch a headless browser via
Playwright, navigate to product pages on books.toscrape.com, and extract
the current price, title, and image URL. It handles timeouts and graceful
browser lifecycle management.
"""

import logging
import re
from typing import Optional

from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)


async def scrape_book(url: str) -> Optional[dict]:
    """
    Scrape a single book page from books.toscrape.com.

    Args:
        url: Full URL of the book detail page.

    Returns:
        A dict with keys ``title``, ``price``, and ``image_url``,
        or ``None`` if the scrape fails.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
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
            await page.goto(url, wait_until="domcontentloaded", timeout=10000)

            # --- Title ---
            title_el = await page.query_selector("h1")
            title = await title_el.inner_text() if title_el else "Unknown Title"

            # --- Price ---
            price_el = await page.query_selector(".product_main .price_color")
            price_raw = await price_el.inner_text() if price_el else "£0.00"
            price_match = re.search(r"[\d\.]+", price_raw)
            price = float(price_match.group(0)) if price_match else 0.0

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
            }
            logger.info("Scraped '%s' — price: %.2f", result["title"], price)
            return result

        except Exception:
            logger.exception("Failed to scrape URL: %s", url)
            return None

        finally:
            await browser.close()
