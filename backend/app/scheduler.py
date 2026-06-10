"""
APScheduler background job configuration.

This module configures the AsyncIOScheduler from APScheduler to
periodically trigger price-check jobs. It manages job lifecycle
(add, reschedule, shutdown) and integrates with the FastAPI
startup/shutdown events via the lifespan context manager.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

from app.alerts import send_discord_alert
from app.database import engine
from app.models import PriceHistory, Product
from app.scraper import scrape_book

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scheduler instance & constants
# ---------------------------------------------------------------------------
scheduler = AsyncIOScheduler()
JOB_ID = "price_monitor_job"


# ---------------------------------------------------------------------------
# Background job
# ---------------------------------------------------------------------------
async def check_prices_task() -> None:
    """
    Iterate over every active product, re-scrape its price, persist
    a new PriceHistory row, and trigger Discord alerts when thresholds
    are breached.
    """
    logger.info("Starting scheduled price check …")

    with Session(engine) as session:
        products = session.exec(
            select(Product).where(Product.status.in_(["Active", "Triggered"]))
        ).all()
        logger.info("Found %d active product(s) to check.", len(products))

        for product in products:
            try:
                scraped = await scrape_book(product.url)

                if scraped is None:
                    logger.warning(
                        "Scrape failed for '%s' — marking as Error.", product.title
                    )
                    product.status = "Error"
                    session.add(product)
                    session.commit()
                    continue

                new_price = scraped["price"]
                logger.info(
                    "Product '%s': old=%.2f  new=%.2f  target=%.2f",
                    product.title,
                    product.current_price,
                    new_price,
                    product.target_price,
                )

                # Update current price
                product.current_price = new_price

                # Insert price-history record
                history = PriceHistory(price=new_price, product_id=product.id)
                session.add(history)

                # --- Alert logic (T019) --------------------------------
                if new_price <= product.target_price and not product.alert_triggered:
                    logger.info(
                        "Price drop detected for '%s' (%.2f <= %.2f). Sending alert …",
                        product.title,
                        new_price,
                        product.target_price,
                    )
                    await send_discord_alert(product, new_price, product.target_price)
                    product.alert_triggered = True
                    product.status = "Triggered"

                elif new_price > product.target_price and product.alert_triggered:
                    logger.info(
                        "Price recovered for '%s' (%.2f > %.2f). Resetting alert.",
                        product.title,
                        new_price,
                        product.target_price,
                    )
                    product.alert_triggered = False
                    product.status = "Active"
                # -------------------------------------------------------

                session.add(product)
                session.commit()

            except Exception:
                logger.exception(
                    "Unexpected error processing product '%s'", product.title
                )
                session.rollback()

    logger.info("Scheduled price check complete.")


# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------
def start_scheduler() -> None:
    """Add the price-check job and start the scheduler."""
    scheduler.add_job(
        check_prices_task,
        trigger=IntervalTrigger(hours=1),
        id=JOB_ID,
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started — interval: 1 h")


def shutdown_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    scheduler.shutdown(wait=False)
    logger.info("Scheduler shut down.")


def reschedule_job(demo: bool) -> str:
    """
    Switch the job between demo (10 s) and production (1 h) intervals.

    Returns:
        A human-readable interval string (``"10s"`` or ``"1h"``).
    """
    if demo:
        trigger = IntervalTrigger(seconds=10)
        interval = "10s"
    else:
        trigger = IntervalTrigger(hours=1)
        interval = "1h"

    scheduler.reschedule_job(job_id=JOB_ID, trigger=trigger)
    logger.info("Rescheduled job to %s interval (demo=%s)", interval, demo)
    return interval
