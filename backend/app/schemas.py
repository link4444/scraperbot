"""
Pydantic request/response schemas.

This module defines the API-facing schemas used for request validation
and response serialization, keeping them separate from the database models
to allow independent evolution of the API contract.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Product schemas
# ---------------------------------------------------------------------------

class ProductCreate(BaseModel):
    """POST /api/products request body."""

    url: str
    target_price: float = Field(..., gt=0, description="Must be a positive number")
    display_currency: str = "USD"


class ProductUpdate(BaseModel):
    """PATCH /api/products/{id} request body."""

    target_price: float = Field(..., gt=0, description="Must be a positive number")


class ProductResponse(BaseModel):
    """Standard product representation returned by the API."""

    id: int
    url: str
    title: str
    image_url: Optional[str] = None
    current_price: float
    target_price: float
    alert_triggered: bool
    status: str
    currency_symbol: str
    currency_code: str
    display_currency: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# PriceHistory schemas
# ---------------------------------------------------------------------------

class PriceHistoryResponse(BaseModel):
    """Single price-history entry returned by the API."""

    id: int
    product_id: int
    price: float
    scraped_at: datetime

    model_config = {"from_attributes": True}

# ---------------------------------------------------------------------------
# Prediction schemas
# ---------------------------------------------------------------------------

class PricePredictionResponse(BaseModel):
    """Probability of reaching target price over different timeframes."""
    
    prob_1_week: float
    prob_1_month: float
    prob_1_year: float
    message: str


# ---------------------------------------------------------------------------
# Demo mode schemas
# ---------------------------------------------------------------------------

class DemoToggleResponse(BaseModel):
    """Response for POST /api/demo/toggle."""

    status: str
    demo_mode: bool
    interval: str


# ---------------------------------------------------------------------------
# Settings schemas
# ---------------------------------------------------------------------------

class SettingsResponse(BaseModel):
    """Response containing system settings."""

    discord_webhook_url: Optional[str] = None


class SettingsUpdate(BaseModel):
    """Request body to update system settings."""

    discord_webhook_url: Optional[str] = None

