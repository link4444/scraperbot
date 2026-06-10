"""
Tests for the Playwright-based web scraper module.

This module contains tests for price extraction, selector handling,
timeout/retry behaviour, and error cases for the scraper.
All Playwright browser interactions are mocked so tests run without a browser.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.scraper import scrape_book


# ---------------------------------------------------------------------------
# Helpers — build a mock Playwright object hierarchy
# ---------------------------------------------------------------------------

def _make_mock_page(
    title_text: str = "A Light in the Attic",
    price_text: str = "£51.77",
    image_src: str = "../../media/cache/fe/72/fe72f0532301ec28e9f5.jpg",
):
    """Return a mock ``page`` whose query_selector calls resolve like a real page."""
    page = AsyncMock()

    title_el = AsyncMock()
    title_el.inner_text.return_value = title_text

    price_el = AsyncMock()
    price_el.inner_text.return_value = price_text

    image_el = AsyncMock()
    image_el.get_attribute.return_value = image_src

    async def _query_selector(selector: str):
        mapping = {
            "h1": title_el,
            ".product_main .price_color": price_el,
            ".item.active img": image_el,
        }
        return mapping.get(selector)

    page.query_selector = AsyncMock(side_effect=_query_selector)
    page.goto = AsyncMock()
    return page


def _build_playwright_mock(page):
    """Wrap a mock page in the full async_playwright context-manager chain."""
    browser = AsyncMock()
    context = AsyncMock()
    context.new_page.return_value = page
    browser.new_context.return_value = context

    chromium = AsyncMock()
    chromium.launch.return_value = browser

    pw = MagicMock()
    pw.chromium = chromium

    pw_context = AsyncMock()
    pw_context.__aenter__ = AsyncMock(return_value=pw)
    pw_context.__aexit__ = AsyncMock(return_value=False)
    return pw_context


# ---------------------------------------------------------------------------
# Tests — successful scrape
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scrape_book_extracts_title():
    """scrape_book should return the book title from the <h1> element."""
    page = _make_mock_page(title_text="A Light in the Attic")
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book(
            "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"
        )

    assert result is not None
    assert result["title"] == "A Light in the Attic"


@pytest.mark.asyncio
async def test_scrape_book_extracts_price_as_float():
    """scrape_book should parse the price string into a float."""
    page = _make_mock_page(price_text="£51.77")
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book(
            "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"
        )

    assert result is not None
    assert isinstance(result["price"], float)
    assert result["price"] == 51.77


@pytest.mark.asyncio
async def test_scrape_book_extracts_image_url():
    """scrape_book should resolve a relative image src to an absolute URL."""
    page = _make_mock_page(
        image_src="../../media/cache/fe/72/fe72f0532301ec28e9f5.jpg"
    )
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book(
            "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"
        )

    assert result is not None
    assert result["image_url"].startswith("http")
    assert "media/cache/fe/72/fe72f0532301ec28e9f5.jpg" in result["image_url"]


@pytest.mark.asyncio
async def test_scrape_book_returns_all_fields():
    """scrape_book result must contain exactly title, price, and image_url."""
    page = _make_mock_page()
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book(
            "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"
        )

    assert result is not None
    assert set(result.keys()) == {"title", "price", "image_url"}


@pytest.mark.asyncio
async def test_scrape_book_strips_whitespace_from_title():
    """Leading/trailing whitespace in the title should be stripped."""
    page = _make_mock_page(title_text="  Sapiens  ")
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book(
            "http://books.toscrape.com/catalogue/sapiens_1/index.html"
        )

    assert result is not None
    assert result["title"] == "Sapiens"


@pytest.mark.asyncio
async def test_scrape_book_handles_price_without_currency_symbol():
    """Prices like '12.99' (no £ prefix) should still parse correctly."""
    page = _make_mock_page(price_text="12.99")
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book(
            "http://books.toscrape.com/catalogue/sapiens_1/index.html"
        )

    assert result is not None
    assert result["price"] == 12.99


# ---------------------------------------------------------------------------
# Tests — error handling
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scrape_book_returns_none_on_navigation_error():
    """If page.goto raises an exception, scrape_book should return None."""
    page = AsyncMock()
    page.goto = AsyncMock(side_effect=Exception("net::ERR_NAME_NOT_RESOLVED"))
    page.query_selector = AsyncMock()
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book("http://nonexistent.invalid/page")

    assert result is None


@pytest.mark.asyncio
async def test_scrape_book_returns_none_on_timeout():
    """If navigation times out, scrape_book should return None."""
    page = AsyncMock()
    page.goto = AsyncMock(side_effect=TimeoutError("Timeout 10000ms exceeded"))
    page.query_selector = AsyncMock()
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book("http://books.toscrape.com/slow-page")

    assert result is None


@pytest.mark.asyncio
async def test_scrape_book_handles_missing_selectors_gracefully():
    """If all selectors return None, scrape_book should still return a dict with defaults."""
    page = AsyncMock()
    page.goto = AsyncMock()
    page.query_selector = AsyncMock(return_value=None)
    pw_ctx = _build_playwright_mock(page)

    with patch("app.scraper.async_playwright", return_value=pw_ctx):
        result = await scrape_book(
            "http://books.toscrape.com/catalogue/some-book_1/index.html"
        )

    assert result is not None
    assert result["title"] == "Unknown Title"
    assert result["price"] == 0.0
    assert result["image_url"] == ""
