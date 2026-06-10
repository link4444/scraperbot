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
# Demo mode schemas
# ---------------------------------------------------------------------------

class DemoToggleResponse(BaseModel):
    """Response for POST /api/demo/toggle."""

    status: str
    demo_mode: bool
    interval: str
