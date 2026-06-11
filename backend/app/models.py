"""
SQLModel database models.

This module defines the ORM models for the Price Monitor application,
including Product and PriceHistory tables. All models use SQLModel for
combined Pydantic + SQLAlchemy functionality.
"""

from datetime import datetime
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

class ProductBase(SQLModel):
    """Shared fields for the Product entity."""

    url: str = Field(unique=True, index=True)
    title: str
    image_url: Optional[str] = None
    current_price: float
    target_price: float
    alert_triggered: bool = False
    status: str = "Active"
    currency_symbol: str = Field(default="£")
    currency_code: str = Field(default="GBP")


class Product(ProductBase, table=True):
    """Persistent Product table."""

    __tablename__ = "products"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    history: List["PriceHistory"] = Relationship(
        back_populates="product",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ---------------------------------------------------------------------------
# PriceHistory
# ---------------------------------------------------------------------------

class PriceHistoryBase(SQLModel):
    """Shared fields for the PriceHistory entity."""

    price: float
    product_id: int = Field(foreign_key="products.id")


class PriceHistory(PriceHistoryBase, table=True):
    """Persistent PriceHistory table."""

    __tablename__ = "price_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    scraped_at: datetime = Field(default_factory=datetime.utcnow)

    product: Product = Relationship(back_populates="history")
