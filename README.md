# Price Monitor

A self-hosted price monitoring web app with AI-powered analysis, Discord alerts, and Monte Carlo price predictions. Built with FastAPI + React + SQLite.

## Features

- **Product Tracking** — Add any URL from `books.toscrape.com` or a CoinGecko coin page and track its price in real time
- **Background Monitoring** — APScheduler re-checks prices every hour (or 10s in demo mode)
- **Discord Alerts** — Rich webhook notifications when a price drops below your target
- **Price History Charts** — Interactive Recharts line chart with 365-day historical data
- **Monte Carlo Predictions** — 5,000 simulations to estimate probability of hitting target in 1wk/1mo/1yr
- **AI Analyst** — Fetches news + on-chain data, generates structured reports with price targets
- **AI Chat** — Two modes:
  - **Online (Groq)** — Uses Groq cloud API with Llama 3.3 70B
  - **Local (Ollama)** — Uses your local Ollama instance (model: `llama3`)
- **Multi-Language UI** — English, Telugu, Hindi
- **Currency Conversion** — Display in USD, INR, EUR, GBP
- **Demo Mode** — Toggle between 1-hour and 10-second polling intervals
- **Demo Data Seeding** — Fill the chart immediately with 30 days of synthetic data

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, SQLModel, SQLite, httpx, Playwright, APScheduler |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS v4, Recharts, Lucide React |
| AI (online) | Groq API (`llama-3.3-70b-versatile`) |
| AI (local) | Ollama (`llama3` on `localhost:11434`) |
| Deployment | Render (Docker backend + static frontend) |

## Quickstart

### Prerequisites

- Python 3.11+
- Node.js 18+
- Ollama (optional, for local AI mode): `ollama pull llama3`

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium --with-deps

# Optional: set your Groq API key
echo 'GROQ_API_KEY="gsk_..."' > .env

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — the Vite dev server proxies `/api/*` to the backend at `:8000`.

## Project Structure

```
backend/
├── app/
│   ├── main.py           # FastAPI app, routes, CORS
│   ├── database.py       # SQLite engine + session factory
│   ├── models.py         # SQLModel: Product, PriceHistory, SystemSetting
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── scraper.py        # httpx scraper + Playwright fallback + DefiLlama API
│   ├── scheduler.py      # APScheduler background job
│   ├── ai_service.py     # AI analysis: Groq, Ollama, mock fallback
│   └── alerts.py         # Discord webhook dispatcher
├── tests/                # Pytest suite
├── requirements.txt
└── Dockerfile            # Render deployment

frontend/
├── src/
│   ├── App.tsx           # Main dashboard
│   ├── main.tsx          # Entry point + axios baseURL
│   ├── index.css         # Tailwind v4 + design tokens
│   ├── translations.ts   # EN / TE / HI strings
│   └── components/
│       ├── AddProductForm.tsx
│       ├── ProductCard.tsx
│       ├── PriceChart.tsx       # Chart + predictions + AI analysis
│       ├── SettingsModal.tsx    # Webhook + AI provider + Groq key
│       └── ChatWidget.tsx       # Floating AI chat bubble
├── package.json
└── vite.config.ts

render.yaml               # Render deployment config
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Root health check |
| `GET` | `/health` | Health check with version |
| `POST` | `/api/products` | Add a product to track |
| `GET` | `/api/products` | List all tracked products |
| `GET` | `/api/products/{id}` | Get a product |
| `PATCH` | `/api/products/{id}` | Update target price |
| `DELETE` | `/api/products/{id}` | Delete a product |
| `POST` | `/api/products/{id}/retry` | Retry a failed scrape |
| `GET` | `/api/products/{id}/history` | Get price history |
| `GET` | `/api/products/{id}/ai-analysis` | AI analyst report |
| `POST` | `/api/products/{id}/ai-chat` | Chat about a specific asset |
| `POST` | `/api/products/{id}/seed-history` | Seed demo data |
| `GET` | `/api/products/{id}/prediction` | Monte Carlo prediction |
| `POST` | `/api/chat` | General AI chat |
| `POST` | `/api/demo/toggle` | Toggle demo mode |
| `GET` | `/api/settings` | Get settings |
| `POST` | `/api/settings` | Update settings |
| `POST` | `/api/test-webhook` | Send test Discord alert |

## Environment Variables

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./pricemonitor.db` | SQLite database path |
| `GROQ_API_KEY` | — | Groq API key (required for online AI) |
| `DISCORD_WEBHOOK_URL` | — | Discord webhook for alerts |
| `FRONTEND_URL` | — | Frontend URL for CORS |
| `CORS_ORIGINS` | — | Extra CORS origins (comma-separated) |
| `PORT` | `8000` | Server port |

### Frontend (build-time)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend URL (e.g. `https://backend.onrender.com`) |

## Deployment on Render

Two services defined in `render.yaml`:

1. **Backend** — Docker service (`backend/Dockerfile`), FastAPI + Playwright
2. **Frontend** — Static site, built from `frontend/`

### Required env vars in Render dashboard

| Service | Variable | Example |
|---------|----------|---------|
| Backend | `FRONTEND_URL` | `https://price-monitor-frontend.onrender.com` |
| Backend | `GROQ_API_KEY` | `gsk_...` (from console.groq.com) |
| Frontend | `VITE_API_BASE_URL` | `https://price-monitor-backend.onrender.com` |

## AI Modes

### Online (Groq)
Uses Groq API with Llama 3.3 70B. Requires a `GROQ_API_KEY` set as an environment variable or in the Settings modal (stored in the database).

### Local (Ollama)
Uses Ollama running on your machine at `http://localhost:11434`. The frontend web app calls Ollama directly from your browser (bypassing the Render backend). Requires `ollama pull llama3`.

Pull the required model:
```bash
ollama pull llama3
```

## License

MIT
