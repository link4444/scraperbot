import asyncio
import logging
from app.scraper import scrape_book

logging.basicConfig(level=logging.DEBUG)

async def main():
    print("Testing bitcoin...")
    try:
        res = await scrape_book("https://www.coingecko.com/en/coins/bitcoin")
        if res:
            print("Success:", res.get("title", ""), len(res.get("history", [])))
        else:
            print("Failed to scrape. Returned None")
    except Exception as e:
        print("Exception:", e)

asyncio.run(main())
