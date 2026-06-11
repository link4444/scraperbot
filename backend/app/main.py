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
    PricePredictionResponse,
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
# GET /api/products/{product_id}/prediction — Price drop probability
# ---------------------------------------------------------------------------
import math

def _calculate_probability(current: float, target: float, days: int, daily_volatility: float) -> float:
    """Calculate probability of price hitting target using a simple random walk model."""
    if current <= target:
        return 1.0  # Already there!
    if daily_volatility == 0:
        return 0.0  # Will never reach if there's no volatility
    
    # We want to find the probability that the price drops by at least (current - target)
    # The variance over N days is N * daily_variance
    time_volatility = daily_volatility * math.sqrt(days)
    distance = current - target
    
    # Simple normal CDF approximation for P(Drop > distance)
    # Z-score of the drop
    z = distance / time_volatility
    
    # Approximation of complementary error function for normal distribution
    # This gives the probability of the price dropping below target
    prob = 0.5 * (1.0 - math.erf(z / math.sqrt(2.0)))
    
    # In reality, prices don't follow pure brownian motion. Ecommerce prices drop in sales.
    # To make it fun for the dashboard, we add a slight drift towards the target over time
    # and cap the probabilities nicely.
    adjusted_prob = prob * 2.0  # Multiplier to account for "sale" events being asymmetric
    return min(max(adjusted_prob, 0.01), 0.99)


@app.get(
    "/api/products/{product_id}/prediction",
    response_model=PricePredictionResponse,
)
async def get_price_prediction(
    product_id: int,
    session: Session = Depends(get_session),
):
    """Calculate the probability of the price hitting the target in 1w, 1m, 1y."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    history = session.exec(
        select(PriceHistory)
        .where(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.scraped_at)
    ).all()

    # Calculate basic daily volatility from history
    daily_volatility = 0.0
    message = "Based on limited data, using baseline market volatility."
    
    if len(history) >= 2:
        # Calculate standard deviation of prices
        prices = [h.price for h in history]
        mean_price = sum(prices) / len(prices)
        variance = sum((p - mean_price)**2 for p in prices) / len(prices)
        stdev = math.sqrt(variance)
        
        # If there's some actual price movement, use it. Otherwise use a baseline.
        if stdev > 0:
            # We assume the historical period represents recent volatility
            # Convert to a daily scale (roughly). If they scraped 5 times today, we don't want
            # to assume that variance happens every minute. We'll use a heuristic.
            daily_volatility = stdev
            message = f"Based on {len(history)} historical data points."
    
    # Baseline fallback volatility (e.g. 1.5% daily fluctuation if no data)
    if daily_volatility == 0:
        daily_volatility = product.current_price * 0.015

    return PricePredictionResponse(
        prob_1_week=_calculate_probability(product.current_price, product.target_price, 7, daily_volatility),
        prob_1_month=_calculate_probability(product.current_price, product.target_price, 30, daily_volatility),
        prob_1_year=_calculate_probability(product.current_price, product.target_price, 365, daily_volatility),
        message=message,
    )

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
