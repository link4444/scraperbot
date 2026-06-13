import asyncio
import httpx
import time

async def main():
    coin_id = "solana"
    now = int(time.time())
    url = f"https://coins.llama.fi/chart/coingecko:{coin_id}?end={now}&span=180&period=1d"
    async with httpx.AsyncClient() as client:
        res = await client.get(url)
        data = res.json()
        prices = data["coins"][f"coingecko:{coin_id}"]["prices"]
        symbol = data["coins"][f"coingecko:{coin_id}"]["symbol"]
        
        # current price
        curr_url = f"https://coins.llama.fi/prices/current/coingecko:{coin_id}"
        curr_res = await client.get(curr_url)
        curr_data = curr_res.json()
        current_price = curr_data["coins"][f"coingecko:{coin_id}"]["price"]
        
        print(symbol, current_price, len(prices))

asyncio.run(main())
