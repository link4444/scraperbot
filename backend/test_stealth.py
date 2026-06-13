import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await stealth_async(page)
        resp = await page.goto('https://api.coingecko.com/api/v3/coins/solana')
        print("Status:", resp.status)
        await browser.close()

asyncio.run(main())
