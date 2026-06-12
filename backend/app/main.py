"""
FastAPI entrypoint for the Price Monitor backend.

This module initializes the FastAPI application, registers routers,
configures CORS, and starts the background scheduler on app startup.
"""

import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

# Import models so SQLModel registers the tables before create_all()
from app import models  # noqa: F401
from app.database import create_db_and_tables, engine, get_session
from app.models import PriceHistory, Product, SystemSetting
from app.schemas import (
    DemoToggleResponse,
    PriceHistoryResponse,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    PricePredictionResponse,
    SettingsResponse,
    SettingsUpdate,
    ChatRequest,
)
from app.scraper import scrape_book
from app.ai_service import get_ai_analysis
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
APP_VERSION = "2.0.0-combined-coingecko"

app = FastAPI(
    title="Price Monitor API",
    description="Backend API for monitoring product prices and sending alerts.",
    version=APP_VERSION,
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
# Health check
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


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
    try:
        logger.info("Background scrape started for product %d: %s", product_id, url)
        
        scraped = None
        try:
            # Enforce a hard 45-second timeout in case Playwright hangs completely at the OS level
            scraped = await asyncio.wait_for(scrape_book(url), timeout=45.0)
        except asyncio.TimeoutError:
            logger.error("scrape_book timed out after 45 seconds for %s", url)
            scraped = None
        except Exception as e:
            logger.exception("scrape_book threw an unhandled exception for product %d", product_id)
            scraped = None

        from datetime import datetime, timezone

        with Session(engine) as session:
            product = session.get(Product, product_id)
            if product is None:
                logger.warning("Product %d deleted before background scrape finished", product_id)
                return

            if scraped is not None:
                product.title = scraped["title"]
                product.image_url = scraped["image_url"]
                product.current_price = scraped["price"]
                product.currency_symbol = scraped.get("currency_symbol", "")
                product.currency_code = scraped.get("currency_code", "UNKNOWN")
                product.status = "Active"

                logger.info(
                    "Background scrape succeeded for product %d: '%s' at %s%.2f",
                    product_id,
                    scraped["title"],
                    scraped.get("currency_symbol", ""),
                    scraped["price"],
                )

                # --- Real historical data (bundled from CoinGecko) ---
                raw_history = scraped.get("history", [])
                if raw_history:
                    # CoinGecko returns ~720 hourly points for 30 days.
                    # Sample every 8th point (~every 8 hours) = ~90 clean data points.
                    sampled = raw_history[::8]
                    for ts_ms, past_price in sampled:
                        entry = PriceHistory(price=past_price, product_id=product.id)
                        entry.scraped_at = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
                        session.add(entry)
                    logger.info(
                        "Inserted %d real historical data points for product %d",
                        len(sampled), product_id
                    )
                else:
                    # No real history — just record today's price as the single starting point
                    session.add(PriceHistory(price=scraped["price"], product_id=product.id))
            else:
                product.status = "Error"
                product.title = "Failed to scrape"
                logger.error("Background scrape failed for product %d: %s", product_id, url)

            session.add(product)
            session.commit()

    except Exception as catastrophic_e:
        logger.exception("Catastrophic error in _background_scrape for product %d: %s", product_id, catastrophic_e)
        try:
            # Rescue the stuck Pending state
            with Session(engine) as rescue_session:
                product = rescue_session.get(Product, product_id)
                if product:
                    product.status = "Error"
                    product.title = "Internal Scraper Error"
                    rescue_session.add(product)
                    rescue_session.commit()
        except Exception:
            pass



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
        display_currency=product_in.display_currency,
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
# POST /api/products/{product_id}/retry — Retry scraping a failed product
# ---------------------------------------------------------------------------
@app.post("/api/products/{product_id}/retry", response_model=ProductResponse)
async def retry_product(
    product_id: int,
    session: Session = Depends(get_session),
):
    """Reset a product to Pending and trigger a new background scrape."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.status = "Pending"
    session.add(product)
    session.commit()
    session.refresh(product)

    task = asyncio.create_task(_background_scrape(product.id, product.url))
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    return product


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

@app.get("/api/products/{product_id}/ai-analysis")
async def fetch_ai_analysis(product_id: int, provider: str = "online", db: Session = Depends(get_session)):
    """Fetch AI Analyst report using DefiLlama, News RSS, and LLMs."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    history = db.exec(
        select(PriceHistory)
        .where(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.scraped_at.asc())
    ).all()
    
    # Extract asset name from title (e.g. "Solana (Crypto)" -> "Solana")
    asset_name = product.title.split(" (")[0] if " (Crypto)" in product.title else product.title
    
    
    api_key_setting = db.get(SystemSetting, "gemini_api_key")
    api_key = api_key_setting.value if api_key_setting else None
    
    try:
        analysis = await get_ai_analysis(
            product_id=product.id,
            asset_name=asset_name,
            current_price=product.current_price,
            history=history,
            provider=provider,
            api_key=api_key
        )
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/products/{product_id}/ai-chat")
async def chat_with_ai(product_id: int, payload: ChatRequest, db: Session = Depends(get_session)):
    """Chat with the AI Analyst about the asset."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    asset_name = product.title.split(" (")[0] if " (Crypto)" in product.title else product.title
    
    
    api_key_setting = db.get(SystemSetting, "gemini_api_key")
    api_key = api_key_setting.value if api_key_setting else None
    
    try:
        from .ai_service import ai_chat
        response = await ai_chat(
            asset_name=asset_name,
            current_price=product.current_price,
            question=payload.question,
            provider=payload.provider,
            api_key=api_key
        )
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# POST /api/products/{product_id}/seed-history — Generate fake history (Demo)
# ---------------------------------------------------------------------------
import random
from datetime import timedelta, timezone, datetime

@app.post("/api/products/{product_id}/seed-history", response_model=dict)
async def seed_price_history(
    product_id: int,
    session: Session = Depends(get_session),
):
    """(DEMO FEATURE) Generates 30 days of randomized fake historical data for the graph."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Delete existing history
    existing = session.exec(select(PriceHistory).where(PriceHistory.product_id == product_id)).all()
    for e in existing:
        session.delete(e)

    base_price = product.current_price
    if base_price == 0:
        base_price = 50.0

    # Generate 30 data points going back in time
    now = datetime.now(timezone.utc)
    current_sim_price = base_price * 1.2  # Start 20% higher 30 days ago
    
    for i in range(30, 0, -1):
        # Random walk with occasional drops
        if random.random() > 0.85:
            # 15% chance of a "sale" drop
            current_sim_price *= random.uniform(0.85, 0.95)
        else:
            # Normal small fluctuation or creep up
            current_sim_price *= random.uniform(0.98, 1.03)
            
        history_entry = PriceHistory(
            price=round(current_sim_price, 2),
            product_id=product.id,
        )
        # Override the auto-generated timestamp
        history_entry.scraped_at = now - timedelta(days=i)
        session.add(history_entry)

    # Add the actual current price as the latest point
    final_entry = PriceHistory(
        price=product.current_price,
        product_id=product.id,
    )
    final_entry.scraped_at = now
    session.add(final_entry)

    session.commit()
    return {"status": "success", "message": "Generated 30 days of fake history for the graph!"}

# ---------------------------------------------------------------------------
# GET /api/products/{product_id}/prediction — Price drop probability
# ---------------------------------------------------------------------------
import math
import random

def _monte_carlo_probability(current: float, target: float, days: int, drift: float, volatility: float, num_simulations: int = 5000) -> float:
    """
    Run Monte Carlo simulation using Geometric Brownian Motion with Mean-Reversion 
    and Jump-Diffusion to find the probability of the price hitting the target.
    """
    if current <= target:
        return 1.0
    if volatility == 0:
        return 0.0
    
    hits = 0
    # Mean Reversion: we dampen the historical short-term drift over long time horizons
    # This prevents a bearish 30-day window from projecting an apocalyptic 99% crash over 365 days.
    dampening_factor = 0.98 
    
    for _ in range(num_simulations):
        sim_price = current
        current_drift = drift
        
        for _ in range(days):
            # Decay the historical trend towards a neutral random walk (0 drift) over time
            current_drift *= dampening_factor
            
            drift_term = current_drift - (volatility ** 2) / 2.0
            
            # Z ~ Normal(0, 1)
            z = random.gauss(0, 1)
            
            # Jump Diffusion: 1% chance per day of a sudden 5-15% flash crash or pump (common in Crypto)
            jump = 0.0
            if random.random() < 0.01:
                jump = random.uniform(-0.15, 0.15)
                
            daily_return = math.exp(drift_term + volatility * z + jump)
            sim_price *= daily_return
            
            if sim_price <= target:
                hits += 1
                break  # Target hit, stop simulating this path
                
    # Ensure a small baseline probability so the graph doesn't look completely dead
    return min(max(hits / num_simulations, 0.01), 0.99)


@app.get(
    "/api/products/{product_id}/prediction",
    response_model=PricePredictionResponse,
)
async def get_price_prediction(
    product_id: int,
    session: Session = Depends(get_session),
):
    """Calculate the probability of the price hitting the target using Monte Carlo simulations."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    history = session.exec(
        select(PriceHistory)
        .where(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.scraped_at)
    ).all()

    drift = 0.0
    volatility = 0.0
    message = "Ran 5,000 Monte Carlo simulations using baseline market volatility."
    
    if len(history) >= 2:
        log_returns = []
        for i in range(1, len(history)):
            prev_price = history[i-1].price
            curr_price = history[i].price
            if prev_price > 0 and curr_price > 0:
                log_returns.append(math.log(curr_price / prev_price))
        
        if log_returns:
            mean_return = sum(log_returns) / len(log_returns)
            variance = sum((r - mean_return)**2 for r in log_returns) / len(log_returns)
            volatility = math.sqrt(variance)
            drift = mean_return
            
            # Scale to daily if we know the time span.
            # We enforce UTC explicitly because SQLite datetime may be naive depending on driver
            dt_start = history[0].scraped_at.replace(tzinfo=timezone.utc) if history[0].scraped_at.tzinfo is None else history[0].scraped_at
            dt_end = history[-1].scraped_at.replace(tzinfo=timezone.utc) if history[-1].scraped_at.tzinfo is None else history[-1].scraped_at
            time_span_days = (dt_end - dt_start).total_seconds() / 86400.0
            
            if time_span_days > 0.5:
                # Approximate points per day
                points_per_day = len(log_returns) / time_span_days
                drift *= points_per_day
                volatility *= math.sqrt(points_per_day)
            
            # Clamp the daily drift so a severe short-term drop doesn't break the math completely
            drift = max(min(drift, 0.02), -0.02)
            
            message = f"Ran 5,000 Mean-Reverting Monte Carlo simulations based on {len(history)} real data points."
            
    # Baseline fallback volatility (e.g. 2% daily fluctuation, slight downward drift if no data)
    if volatility == 0:
        volatility = 0.02
        drift = -0.001

    return PricePredictionResponse(
        prob_1_week=_monte_carlo_probability(product.current_price, product.target_price, 7, drift, volatility),
        prob_1_month=_monte_carlo_probability(product.current_price, product.target_price, 30, drift, volatility),
        prob_1_year=_monte_carlo_probability(product.current_price, product.target_price, 365, drift, volatility),
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
# GET /api/settings — Retrieve app settings
# ---------------------------------------------------------------------------
@app.get("/api/settings", response_model=SettingsResponse)
async def get_settings(db: Session = Depends(get_session)):
    """Retrieve dynamic application settings."""
    db_url_setting = db.get(SystemSetting, "discord_webhook_url")
    discord_webhook_url = db_url_setting.value if db_url_setting else os.getenv("DISCORD_WEBHOOK_URL")
    
    db_ai_setting = db.get(SystemSetting, "ai_provider")
    ai_provider = db_ai_setting.value if db_ai_setting else "online"
    
    db_key_setting = db.get(SystemSetting, "gemini_api_key")
    gemini_api_key = db_key_setting.value if db_key_setting else ""
    
    return SettingsResponse(discord_webhook_url=discord_webhook_url, ai_provider=ai_provider, gemini_api_key=gemini_api_key)


# ---------------------------------------------------------------------------
# POST /api/settings — Update app settings
# ---------------------------------------------------------------------------
DISCORD_WEBHOOK_REGEX = re.compile(
    r"^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9\-_]+$"
)


@app.post("/api/settings", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdate, db: Session = Depends(get_session)):
    """Update dynamic application settings."""
    url = payload.discord_webhook_url
    if url:
        url = url.strip()
        if not DISCORD_WEBHOOK_REGEX.match(url):
            raise HTTPException(
                status_code=400,
                detail="Invalid Discord Webhook URL. It must match the pattern: https://discord.com/api/webhooks/..."
            )
    else:
        url = ""

    db_url_setting = db.get(SystemSetting, "discord_webhook_url")
    if db_url_setting:
        db_url_setting.value = url
    else:
        db_url_setting = SystemSetting(key="discord_webhook_url", value=url)
    db.add(db_url_setting)

    ai_provider = payload.ai_provider or "online"
    if ai_provider not in ["online", "local"]:
        ai_provider = "online"

    db_ai_setting = db.get(SystemSetting, "ai_provider")
    if db_ai_setting:
        db_ai_setting.value = ai_provider
    else:
        db_ai_setting = SystemSetting(key="ai_provider", value=ai_provider)
    db.add(db_ai_setting)

    gemini_api_key = payload.gemini_api_key or ""
    db_key_setting = db.get(SystemSetting, "gemini_api_key")
    if db_key_setting:
        db_key_setting.value = gemini_api_key
    else:
        db_key_setting = SystemSetting(key="gemini_api_key", value=gemini_api_key)
    db.add(db_key_setting)

    db.commit()

    return SettingsResponse(discord_webhook_url=url, ai_provider=ai_provider, gemini_api_key=gemini_api_key)


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
