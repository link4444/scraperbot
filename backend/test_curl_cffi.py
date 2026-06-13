import asyncio
from curl_cffi.requests import AsyncSession

async def main():
    async with AsyncSession(impersonate="chrome110") as s:
        res = await s.get("https://api.coingecko.com/api/v3/coins/solana")
        print("Status:", res.status_code)

asyncio.run(main())
