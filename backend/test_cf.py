import cloudscraper

scraper = cloudscraper.create_scraper()
res = scraper.get("https://api.coingecko.com/api/v3/coins/bitcoin")
print(res.status_code)
