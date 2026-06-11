"""
FastAPI entrypoint for the Price Monitor backend.

This module initializes the FastAPI application, registers routers,
configures CORS, and starts the background scheduler on app startup.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

# Import models so SQLModel registers the tables before create_all()
from app import models  # noqa: F401
from app.database import create_db_and_tables, engine, get_session
from app.models import PriceHistory, Product
from app.schemas import (
    DemoToggleResponse,
    PriceHistoryResponse,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
)
from app.scraper import scrape_book
from app.scheduler import reschedule_job, shutdown_scheduler, start_scheduler
from app.alerts import send_discord_alert

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
DISCORD_WEBHOOK_URL: str | None = os.getenv("DISCORD_WEBHOOK_URL")
FRONTEND_URL: str | None = os.getenv("FRONTEND_URL")


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables on startup; start scheduler; clean up on shutdown."""
    logger.info("Creating database tables …")
    create_db_and_tables()
    logger.info("Database tables ready.")

    logger.info("Starting background scheduler …")
    start_scheduler()
    logger.info("Scheduler running.")

    yield

    logger.info("Shutting down scheduler …")
    shutdown_scheduler()


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Price Monitor API",
    description="Backend API for monitoring product prices and sending alerts.",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow the React dev server
# ---------------------------------------------------------------------------
_cors_origins = ["http://localhost:5173"]
if FRONTEND_URL:
    _cors_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Background scrape helper
# ---------------------------------------------------------------------------
async def _background_scrape(product_id: int, url: str) -> None:
    """
    Scrape a product URL in the background and update the DB row.

    On success the product status is set to ``Active`` and an initial
    PriceHistory entry is recorded.  On failure the status is set to
    ``Error`` with a descriptive title.
    """
    logger.info("Background scrape started for product %d: %s", product_id, url)
    scraped = await scrape_book(url)

    with Session(engine) as session:
        product = session.get(Product, product_id)
        if product is None:
            logger.warning(
                "Product %d deleted before background scrape finished", product_id
            )
            return

        if scraped is not None:
            product.title = scraped["title"]
            product.image_url = scraped["image_url"]
            product.current_price = scraped["price"]
            product.currency_symbol = scraped.get("currency_symbol", "")
            product.currency_code = scraped.get("currency_code", "UNKNOWN")
            product.status = "Active"

            # Create initial price-history entry
            history_entry = PriceHistory(
                price=scraped["price"],
                product_id=product.id,
            )
            session.add(history_entry)
            logger.info(
                "Background scrape succeeded for product %d: '%s' at %s%.2f",
                product_id,
                scraped["title"],
                scraped.get("currency_symbol", ""),
                scraped["price"],
            )
        else:
            product.status = "Error"
            product.title = "Failed to scrape"
            logger.error("Background scrape failed for product %d: %s", product_id, url)

        session.add(product)
        session.commit()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    """Health-check / root endpoint."""
    return {"status": "ok"}


# Set to keep strong references to background tasks
_running_tasks = set()

# ---------------------------------------------------------------------------
# POST /api/products — Track a new product (non-blocking background scrape)
# ---------------------------------------------------------------------------
@app.post("/api/products", response_model=ProductResponse, status_code=201)
async def add_product(
    product_in: ProductCreate,
    session: Session = Depends(get_session),
):
    """Accept a product URL, persist it as Pending, and kick off a background scrape."""
    # 1. Create the Product row immediately with placeholder values
    product = Product(
        url=product_in.url,
        title="Fetching...",
        image_url=None,
        current_price=0.0,
        target_price=product_in.target_price,
        status="Pending",
    )

    # 2. Persist — handle duplicate URLs
    try:
        session.add(product)
        session.commit()
        session.refresh(product)
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=400,
            detail="A product with this URL is already being tracked",
        )

    # 3. Kick off background scrape safely (prevents HTTP/2 stream blocking)
    task = asyncio.create_task(_background_scrape(product.id, product_in.url))
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    # 4. Return immediately with Pending status
    return product


# ---------------------------------------------------------------------------
# GET /api/products — List all tracked products
# ---------------------------------------------------------------------------
@app.get("/api/products", response_model=list[ProductResponse])
async def list_products(session: Session = Depends(get_session)):
    """Return every tracked product."""
    products = session.exec(select(Product)).all()
    return products


# ---------------------------------------------------------------------------
# GET /api/products/{product_id} — Get a single product
# ---------------------------------------------------------------------------
@app.get("/api/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    session: Session = Depends(get_session),
):
    """Return a single product by ID."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# ---------------------------------------------------------------------------
# PATCH /api/products/{product_id} — Update target price
# ---------------------------------------------------------------------------
@app.patch("/api/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_in: ProductUpdate,
    session: Session = Depends(get_session),
):
    """Update the target-price threshold and reset the alert flag."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.target_price = product_in.target_price
    product.alert_triggered = False

    session.add(product)
    session.commit()
    session.refresh(product)
    return product


# ---------------------------------------------------------------------------
# DELETE /api/products/{product_id} — Remove a product (cascade history)
# ---------------------------------------------------------------------------
@app.delete("/api/products/{product_id}", status_code=204)
async def delete_product(
    product_id: int,
    session: Session = Depends(get_session),
):
    """Delete a product and its price-history entries."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    session.delete(product)
    session.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# GET /api/products/{product_id}/history — Price history for a product
# ---------------------------------------------------------------------------
@app.get(
    "/api/products/{product_id}/history",
    response_model=list[PriceHistoryResponse],
)
async def get_price_history(
    product_id: int,
    session: Session = Depends(get_session),
):
    """Return all price-history entries for a given product."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    history = session.exec(
        select(PriceHistory)
        .where(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.scraped_at)
    ).all()
    return history


# ---------------------------------------------------------------------------
# POST /api/demo/toggle — Switch scheduler between demo & production
# ---------------------------------------------------------------------------
@app.post("/api/demo/toggle", response_model=DemoToggleResponse)
async def toggle_demo_mode(demo: bool):
    """Toggle the scheduler between 10-second demo and 1-hour production intervals."""
    interval = reschedule_job(demo)
    return DemoToggleResponse(
        status="success",
        demo_mode=demo,
        interval=interval,
    )


# ---------------------------------------------------------------------------
# POST /api/test-webhook — Fire a test Discord alert
# ---------------------------------------------------------------------------
@app.post("/api/test-webhook")
async def test_webhook():
    """Send a test Discord embed to verify webhook configuration."""

    class _DummyProduct:
        title = "Test Product — A Light in the Attic"
        url = "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"
        image_url = (
            "http://books.toscrape.com/media/cache/fe/72/"
            "fe72f0532301ec28791a2b8571f20b17.jpg"
        )

    success = await send_discord_alert(
        product=_DummyProduct(),
        current_price=18.00,
        target_price=20.00,
    )
    if success:
        return {"status": "ok", "message": "Test alert sent to Discord."}
    return {"status": "warning", "message": "Discord webhook not configured or delivery failed."}
