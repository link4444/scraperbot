import asyncio
from sqlmodel import Session, create_engine, SQLModel
from app.database import engine
from app.models import Product
from app.main import _background_scrape

async def run():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        product = Product(url="https://www.coingecko.com/en/coins/bitcoin", title="Test", current_price=0, target_price=50000, status="Pending")
        session.add(product)
        session.commit()
        session.refresh(product)
        pid = product.id
    
    try:
        await _background_scrape(pid, "https://www.coingecko.com/en/coins/bitcoin")
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(run())
