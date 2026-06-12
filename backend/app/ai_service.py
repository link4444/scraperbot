import json
import asyncio
import httpx
from xml.etree import ElementTree
from datetime import datetime, timedelta
import logging
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)

# Simple TTL in-memory cache
_CACHE = {}

async def fetch_news(asset_name: str) -> list:
    """Fetch top 3-5 news headlines from Google News RSS as fallback for CryptoPanic."""
    url = f"https://news.google.com/rss/search?q={asset_name}+crypto&hl=en-US&gl=US&ceid=US:en"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            
            root = ElementTree.fromstring(resp.text)
            news = []
            for item in root.findall(".//item")[:5]:
                title = item.find("title").text if item.find("title") is not None else ""
                news.append(title)
            return news
    except Exception as e:
        logger.error(f"Failed to fetch news for {asset_name}: {e}")
        return ["No recent news available."]

async def fetch_onchain_data(asset_name: str) -> dict:
    """Fetch TVL and 24h DEX volume if possible (crypto only)."""
    # Try DefiLlama protocol endpoint
    url = f"https://api.llama.fi/protocol/{asset_name.lower().replace(' ', '-')}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                tvl = data.get("tvl", [])
                current_tvl = tvl[-1].get("totalLiquidityUSD", 0) if tvl else 0
                return {
                    "tvl": f"${current_tvl:,.2f}" if current_tvl else "N/A",
                    "volume_change": "Data unavailable via DefiLlama protocol endpoint" # Requires complex DEX endpoint
                }
    except Exception:
        pass
    return {"tvl": "N/A", "volume_change": "N/A"}

async def get_ai_analysis(
    product_id: int, 
    asset_name: str, 
    current_price: float, 
    history: list, 
    provider: str = "local"
) -> dict:
    
    cache_key = f"ai_analysis:{product_id}"
    cached = _CACHE.get(cache_key)
    if cached and datetime.now() < cached["expires"]:
        return cached["data"]

    # Calculate High/Low
    high_365 = max([p.price for p in history]) if history else current_price
    low_365 = min([p.price for p in history]) if history else current_price

    # Parallel Fetch
    news_task = fetch_news(asset_name)
    onchain_task = fetch_onchain_data(asset_name)
    news_array, onchain_data = await asyncio.gather(news_task, onchain_task)

    system_prompt = f"""You are an expert financial analyst specializing in crypto asset valuation. Analyze the following data for {asset_name}:
- Current Price: ${current_price}
- 365-Day High/Low: ${high_365} / ${low_365}
- 24h DEX Volume Change: {onchain_data['volume_change']}
- Current TVL: {onchain_data['tvl']}
- Recent Headlines: {json.dumps(news_array)}

Based on this mathematical price history, on-chain metrics, and recent news sentiment, you must respond ONLY in a valid JSON object matching this exact schema:
{{
  "sentiment_analysis": "A concise, 3-sentence market sentiment breakdown summarizing macro trends and news impacts.",
  "targets": [
    {{"type": "Aggressive", "price": 0.00, "justification": "A 1-sentence technical or sentimental reason for this high-risk entry."}},
    {{"type": "Moderate", "price": 0.00, "justification": "A 1-sentence technical or sentimental reason for this balanced entry."}},
    {{"type": "Safe", "price": 0.00, "justification": "A 1-sentence technical or sentimental reason for this conservative/floor entry."}}
  ]
}}
Do not include markdown code blocks like ```json or any conversational filler text outside of the raw JSON object."""

    result_json = None

    if provider == "local":
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                payload = {
                    "model": "llama3",
                    "prompt": system_prompt,
                    "stream": False,
                    "format": "json"
                }
                resp = await client.post("http://localhost:11434/api/generate", json=payload)
                resp.raise_for_status()
                result_json = resp.json().get("response", "{}")
        except Exception as e:
            logger.error(f"Ollama failed: {e}")
            raise ValueError("Local AI Model failed to respond.")
    else:
        # Fallback to online/mock since keys might not exist in this environment.
        # Ideally, we'd hit OpenAI or Gemini here.
        # We will just simulate it for safety if no key is provided, or hit Gemini if key exists.
        import os
        gemini_key = os.environ.get("GEMINI_API_KEY")
        if gemini_key:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    payload = {
                        "contents": [{"parts": [{"text": system_prompt}]}],
                        "generationConfig": {"response_mime_type": "application/json"}
                    }
                    resp = await client.post(url, json=payload)
                    resp.raise_for_status()
                    result_json = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                logger.error(f"Gemini failed: {e}")
                raise ValueError("Online AI Model failed to respond.")
        else:
            # Fallback mock for testing without keys
            result_json = json.dumps({
                "sentiment_analysis": "This is a simulated online response because GEMINI_API_KEY is not set. The asset shows normal volatility. News sentiment remains neutral.",
                "targets": [
                    {"type": "Aggressive", "price": current_price * 0.9, "justification": "Aggressive drop target."},
                    {"type": "Moderate", "price": current_price * 0.8, "justification": "Moderate historical support."},
                    {"type": "Safe", "price": current_price * 0.6, "justification": "Macro crash floor."}
                ]
            })

    # Parse and cache
    try:
        parsed_data = json.loads(result_json)
        # Ensure it has targets
        if "targets" not in parsed_data:
            raise ValueError("Invalid JSON schema returned by AI.")
        
        _CACHE[cache_key] = {
            "data": parsed_data,
            "expires": datetime.now() + timedelta(minutes=15)
        }
        return parsed_data
    except Exception as e:
        logger.error(f"Failed to parse AI response: {e}")
        logger.error(f"Raw response: {result_json}")
        raise ValueError("AI returned invalid data format.")
