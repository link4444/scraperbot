import asyncio
from app.main import _background_scrape
from app.database import engine
from sqlmodel import Session
from app.models import Product

async def test():
    with Session(engine) as session:
        product = Product(url="https://www.coingecko.com/en/coins/bitcoin", title="Test", current_price=0, target_price=50000, status="Pending")
        session.add(product)
        session.commit()
        session.refresh(product)
        pid = product.id
    
    await _background_scrape(pid, "https://www.coingecko.com/en/coins/bitcoin")

asyncio.run(test())
