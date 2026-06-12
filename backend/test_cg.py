import asyncio
from app.scraper import fetch_coingecko_history

async def test():
    data = await fetch_coingecko_history("bitcoin", 30)
    print(f"Data length: {len(data)}")

asyncio.run(test())
