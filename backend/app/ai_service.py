import json
import asyncio
import httpx
from xml.etree import ElementTree
from datetime import datetime, timedelta
import logging
import os

try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    load_dotenv(env_path)
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
    provider: str = "online",
    api_key: str = None
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
  "summary": "A concise, simple 2-3 sentence summary of what this data means for the average user.",
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
            async with httpx.AsyncClient(timeout=120) as client:
                payload = {
                    "model": "qwen2.5",
                    "prompt": system_prompt,
                    "stream": False,
                    "format": "json"
                }
                resp = await client.post("http://localhost:11434/api/generate", json=payload)
                resp.raise_for_status()
                result_json = resp.json().get("response", "{}")
        except Exception as e:
            logger.error(f"Ollama failed: {e}")
            raise ValueError("Local AI Model failed to respond. Ensure Ollama is running locally with 'qwen2.5' pulled.")
    else:
        # Fallback to online/mock since keys might not exist in this environment.
        # Ideally, we'd hit Groq here.
        import os
        groq_key = api_key or os.environ.get("GROQ_API_KEY")
        if groq_key:
            url = "https://api.groq.com/openai/v1/chat/completions"
            try:
                headers = {
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": system_prompt}],
                    "response_format": {"type": "json_object"}
                }
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    result_json = resp.json()["choices"][0]["message"]["content"]
            except Exception as e:
                logger.error(f"Groq failed: {e}")
                raise ValueError("Online AI Model (Groq) failed to respond. Check if your API key is valid.")
        else:
            # Fallback mock for testing without keys
            result_json = json.dumps({
                "summary": "This is a simulated summary because GROQ_API_KEY is not set. The asset shows normal volatility.",
                "sentiment_analysis": "This is a simulated online response because GROQ_API_KEY is not set. The asset shows normal volatility. News sentiment remains neutral.",
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

async def general_chat(question: str, provider: str = "online", api_key: str = None) -> str:
    """Chat with a general AI assistant (no product context)."""
    system_prompt = f"""You are a helpful AI assistant for PriceMonitor, a price tracking application.
You can answer questions about:
- How the price monitoring platform works
- How to track product prices
- General financial education questions
- Technical questions about the app

If the user asks something unrelated, politely redirect to topics within your scope.
Keep your answers concise, professional, and no more than 3-4 sentences.

User's question: {question}"""

    if provider == "local":
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                payload = {
                    "model": "qwen2.5",
                    "prompt": system_prompt,
                    "stream": False
                }
                resp = await client.post("http://localhost:11434/api/generate", json=payload)
                resp.raise_for_status()
                return resp.json().get("response", "I could not generate a response.")
        except Exception as e:
            logger.error(f"Ollama chat failed: {e}")
            raise ValueError("Local AI Model failed to respond. Ensure Ollama is running locally with 'qwen2.5' pulled.")
    else:
        groq_key = api_key or os.environ.get("GROQ_API_KEY")
        if groq_key:
            url = "https://api.groq.com/openai/v1/chat/completions"
            try:
                headers = {
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": system_prompt}]
                }
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    return resp.json()["choices"][0]["message"]["content"]
            except Exception as e:
                logger.error(f"Groq chat failed: {e}")
                raise ValueError("Online AI Model (Groq) failed to respond. Check if your API key is valid.")
        else:
            return "This is a simulated response because GROQ_API_KEY is not set. Please add your key to chat with the AI."

async def ai_chat(asset_name: str, current_price: float, question: str, provider: str = "online", api_key: str = None) -> str:
    """Chat with the AI Analyst about the asset."""
    system_prompt = f"""You are a strict financial AI analyst. You are currently analyzing {asset_name} which is priced at ${current_price}.
CRITICAL RULES:
1. You MUST ONLY answer questions strictly related to this specific asset ({asset_name}), general financial advice, or trading strategy.
2. If the user asks about ANYTHING ELSE (e.g., coding, cooking, general knowledge, weather), you must decline to answer and say "I am a financial analyst and can only answer questions related to {asset_name} or financial markets."
3. Keep your answers concise, professional, and no more than 3-4 sentences.

User's question: {question}"""

    if provider == "local":
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                payload = {
                    "model": "qwen2.5",
                    "prompt": system_prompt,
                    "stream": False
                }
                resp = await client.post("http://localhost:11434/api/generate", json=payload)
                resp.raise_for_status()
                return resp.json().get("response", "I could not generate a response.")
        except Exception as e:
            logger.error(f"Ollama chat failed: {e}")
            raise ValueError("Local AI Model failed to respond. Ensure Ollama is running locally with 'qwen2.5' pulled.")
    else:
        import os
        groq_key = api_key or os.environ.get("GROQ_API_KEY")
        if groq_key:
            url = "https://api.groq.com/openai/v1/chat/completions"
            try:
                headers = {
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": system_prompt}]
                }
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    return resp.json()["choices"][0]["message"]["content"]
            except Exception as e:
                logger.error(f"Groq chat failed: {e}")
                raise ValueError("Online AI Model (Groq) failed to respond. Check if your API key is valid.")
        else:
            return "This is a simulated response because GROQ_API_KEY is not set. Please add your key to chat with the AI."
