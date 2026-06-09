# Technical Research: Web Scraper & Price Monitor

This document records the research findings and code snippets for key technical components of the Price Monitor application.

---

## 1. Scraping Target: `books.toscrape.com` DOM Structure

`books.toscrape.com` is a sandbox book store website that is highly stable and does not implement bot detection. It is perfect for hackathon demonstrations.

### Detail Page Selector Analysis
For a standard book detail page (e.g., `http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`):
*   **Title**: `h1` element inside the product main layout.
*   **Price**: The element with class `.price_color` inside `.product_main`. Text format: `£51.77`. We must strip the currency symbol (`£`) and cast the remainder to a float (`51.77`).
*   **Image**: The main image element has selector `.item.active img`. We need to extract the `src` attribute and resolve it to an absolute URL relative to the base domain (e.g., `http://books.toscrape.com/catalogue/...`).
*   **Availability/Stock**: Elements with class `.instock.availability`. Text shows `In stock (22 available)`. We can parse the stock count if needed.

### Sample Scraper Script (Playwright Async)
```python
import re
from playwright.async_api import async_playwright

async def scrape_book(url: str):
    async with async_playwright() as p:
        # Launch browser with sandbox disabled to run in containerized environments (Docker/Render)
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=10000)
            
            # Extract title
            title_el = await page.query_selector("h1")
            title = await title_el.inner_text() if title_el else "Unknown Title"
            
            # Extract price
            price_el = await page.query_selector(".product_main .price_color")
            price_raw = await price_el.inner_text() if price_el else "£0.00"
            price_match = re.search(r"[\d\.]+", price_raw)
            price = float(price_match.group(0)) if price_match else 0.0
            
            # Extract image URL
            image_el = await page.query_selector(".item.active img")
            image_src = await image_el.get_attribute("src") if image_el else ""
            # Resolve relative image URL to absolute URL
            absolute_image_url = url.split("/catalogue/")[0] + "/" + image_src.replace("../", "")
            
            return {
                "title": title.strip(),
                "price": price,
                "image_url": absolute_image_url
            }
        finally:
            # Crucial: Always close browser to avoid OOM memory leaks
            await browser.close()
```

---

## 2. Dynamic Scheduling with APScheduler inside FastAPI

We need to dynamically switch the schedule interval between 1 hour (production monitoring) and 10 seconds (for live hackathon demos).

### Life-Cycle Integration
```python
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

scheduler = AsyncIOScheduler()
JOB_ID = "price_monitor_job"

async def check_prices_task():
    # Scraping loop and threshold evaluation goes here
    print("Running scheduled price check...")

def setup_scheduler(app: FastAPI):
    @app.on_event("startup")
    async def start_scheduler():
        scheduler.add_job(
            check_prices_task,
            trigger=IntervalTrigger(hours=1),
            id=JOB_ID,
            replace_existing=True
        )
        scheduler.start()

    @app.on_event("shutdown")
    async def shutdown_scheduler():
        scheduler.shutdown()
```

### Rescheduling Route
```python
@app.post("/api/demo/toggle")
async def toggle_demo_mode(demo: bool):
    trigger = IntervalTrigger(seconds=10) if demo else IntervalTrigger(hours=1)
    scheduler.reschedule_job(job_id=JOB_ID, trigger=trigger)
    return {"status": "success", "demo_mode": demo, "interval": "10s" if demo else "1h"}
```

---

## 3. Discord Webhook Payload Format

To send professional-looking real-time notifications, we use Discord's rich embeds.

### Payload Structure (JSON)
```json
{
  "embeds": [
    {
      "title": "🚨 Price Drop Alert!",
      "description": "**[A Light in the Attic](http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html)** has dropped below your target price!",
      "color": 3066993, 
      "fields": [
        {
          "name": "Current Price",
          "value": "£18.00",
          "inline": true
        },
        {
          "name": "Target Price",
          "value": "£20.00",
          "inline": true
        },
        {
          "name": "Discount",
          "value": "10.0%",
          "inline": true
        }
      ],
      "thumbnail": {
        "url": "http://books.toscrape.com/media/cache/2c/da/2cdad77c477b32af450d9256d5e1ccb2.jpg"
      },
      "footer": {
        "text": "Price Monitor Bot"
      },
      "timestamp": "2026-06-09T13:17:00Z"
    }
  ]
}
```

---

## 4. SQLite Persistent Volume on Render

SQLite database files are stored locally on disk. On Render, the local disk is ephemeral and resets with every deployment.
*   **Resolution**: Render allows mounting a Persistent Volume. We mount a disk at `/var/data` in the Render dashboard and configure our SQLAlchemy engine to point to `/var/data/pricemonitor.db`.
*   **WAL Mode**: Enable WAL (Write-Ahead Logging) to allow concurrent readers while a write operation is active (e.g., dashboard query during background scraping).
    ```python
    from sqlalchemy import create_engine
    from sqlalchemy.event import listen

    DATABASE_URL = "sqlite:////var/data/pricemonitor.db"

    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    engine = create_engine(DATABASE_URL)
    listen(engine, "connect", set_sqlite_pragma)
    ```
