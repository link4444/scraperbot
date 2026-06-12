import asyncio
import httpx
async def test():
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "application/json"}
    url = "https://api.coingecko.com/api/v3/coins/ethereum?localization=false"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        print(resp.status_code)
        print(resp.text[:100])
asyncio.run(test())
