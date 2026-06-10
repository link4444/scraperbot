# Price Monitor — Web Scraper & Alert System

A lightweight, self-hosted web application for monitoring product prices. Built with a modern stack featuring a FastAPI backend, a React + Vite + Tailwind frontend, and background scheduling with APScheduler and Playwright.

## Features
- **Immediate Scraping**: Add a product URL and immediately scrape its title, image, and price.
- **Background Monitoring**: Automatically check prices on a scheduled interval.
- **Discord Alerts**: Receive rich webhook notifications when prices drop below your custom threshold.
- **Live Demo Mode**: Instantly switch the polling interval from 1 hour to 10 seconds for real-time demonstrations.
- **Visual Dashboard**: Beautiful glassmorphic UI to view all tracked products, complete with historical price charts.

## Technology Stack
- **Frontend**: React, Vite, TypeScript, Tailwind CSS v4, Recharts, Lucide React
- **Backend**: Python 3.11, FastAPI, SQLModel (SQLite), Playwright, APScheduler, httpx

## Project Structure
```text
├── backend/            # FastAPI application and background worker
│   ├── app/            # Application code (routes, scraper, models)
│   ├── tests/          # Pytest suite
│   ├── requirements.txt
│   └── Dockerfile      # Configured with Playwright browsers
├── frontend/           # React dashboard
│   ├── src/            # Components (ProductCard, PriceChart, etc.)
│   ├── package.json
│   └── vite.config.ts  # Configured with API proxy
└── specs/              # Original design documents
```

## Quickstart

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium --with-deps

# Set environment variables
export DATABASE_URL="sqlite:///./pricemonitor.db"
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/your-mock-webhook"

# Start the server
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The frontend dashboard will be available at `http://localhost:5173`. API requests are automatically proxied to the backend at port `8000`.

## Deployment
For containerized deployments (like Render), a `Dockerfile` is provided in the `backend/` directory which includes Playwright and its dependencies. Ensure that your production database is mounted to a persistent volume (e.g., `/data/pricemonitor.db`) to prevent data loss across deployments.
