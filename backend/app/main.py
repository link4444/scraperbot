"""
FastAPI entrypoint for the Price Monitor backend.

This module initializes the FastAPI application, registers routers,
configures CORS, and starts the background scheduler on app startup.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

# Import models so SQLModel registers the tables before create_all()
from app import models  # noqa: F401
from app.database import create_db_and_tables, get_session
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
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    """Health-check / root endpoint."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /api/products — Track a new product (immediate scrape)
# ---------------------------------------------------------------------------
@app.post("/api/products", response_model=ProductResponse, status_code=201)
async def add_product(
    product_in: ProductCreate,
    session: Session = Depends(get_session),
):
    """Add a product URL, scrape it immediately, and persist the result."""
    # 1. Scrape the product page
    scraped = await scrape_book(product_in.url)
    if scraped is None:
        raise HTTPException(status_code=400, detail="Failed to scrape product")

    # 2. Build the Product row
    product = Product(
        url=product_in.url,
        title=scraped["title"],
        image_url=scraped["image_url"],
        current_price=scraped["price"],
        target_price=product_in.target_price,
    )

    # 3. Persist — handle duplicate URLs
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

    # 4. Create initial price-history entry
    history_entry = PriceHistory(
        price=scraped["price"],
        product_id=product.id,
    )
    session.add(history_entry)
    session.commit()

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
