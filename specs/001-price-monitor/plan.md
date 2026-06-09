# Implementation Plan: Price Monitor — Web Scraper & Alert System

**Branch**: `001-price-monitor` | **Date**: 2026-06-09 | **Spec**: [spec.md](file:///home/link4444/hackathon2/hackathon2/specs/001-price-monitor/spec.md)

---

## Summary
The goal is to build a self-hosted, lightweight price monitoring system. The user inputs a product URL from `books.toscrape.com`. The application immediately scrapes the name, price, and image using Playwright, persisting this to an SQLite database. It runs a scheduled task using APScheduler every hour to pull the latest price. If the price falls below a user-defined threshold, it sends a webhook notification to Discord. Users monitor price histories via a React dashboard with charts.

---

## Technical Context

*   **Language/Version**: Python 3.11+ (Backend), TypeScript / Node.js 18+ (Frontend)
*   **Primary Dependencies**:
    *   *Backend*: FastAPI, Uvicorn, Playwright (python), SQLModel / SQLAlchemy, APScheduler, httpx, pydantic.
    *   *Frontend*: React, Tailwind CSS, Lucide React, Recharts, Radix UI (shadcn/ui), Axios / Fetch.
*   **Storage**: SQLite (`WAL` mode enabled for concurrency).
*   **Testing**: `pytest` (backend), `pytest-asyncio` for endpoints and scraper mocking.
*   **Target Platform**: Render Free Tier.
*   **Project Type**: Web Application (FastAPI backend + React frontend).
*   **Performance Goals**: Scrapes completed under 5 seconds; Webhook dispatches under 1 second.
*   **Constraints**:
    *   Memory: <512MB RAM (Render limit). Playwright must launch, perform the scrape, and immediately shut down the browser and page contexts.
    *   Storage: Local SQLite database must be saved in a persistent folder `/data/` mounted on Render.

---

## Project Structure

For this web application, we select a split structure separating backend and frontend logic:

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI entrypoint, routes, and lifespan setup
│   ├── database.py       # SQLModel engine and async session creator
│   ├── models.py         # Database models (Product, PriceHistory)
│   ├── schemas.py        # Pydantic validation schemas
│   ├── scraper.py        # Playwright scraping engine
│   ├── scheduler.py      # APScheduler job configuration and managers
│   └── alerts.py         # Discord webhook dispatcher
├── tests/
│   ├── test_scraper.py
│   ├── test_api.py
│   └── test_alerts.py
├── requirements.txt
└── Dockerfile

frontend/
├── src/
│   ├── components/       # Reusable components (PriceChart, ProductCard, AddProductForm)
│   │   ├── ui/           # Radix UI wrapper primitives (button, input, card, dialog)
│   │   ├── PriceChart.tsx
│   │   ├── ProductCard.tsx
│   │   └── AddProductForm.tsx
│   ├── App.tsx           # Dashboard dashboard hub and charts aggregator
│   ├── index.css         # Styling system entrypoint (Tailwind configuration)
│   └── main.tsx
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

**Structure Decision**: Web application layout. Having two separate subfolders `backend` and `frontend` allows clean dependency separation, isolated linting/testing suites, and simple deployment mapping on Render.

---

## Technical Execution Plan

### Phase 0: Setup & Configuration
Verify Python, Node.js, and Playwright libraries can be installed. Set up the basic directories and configuration files.

### Phase 1: Backend Database & Scraping Foundation
1.  Initialize SQLite database using SQLModel with async drivers.
2.  Implement the Playwright-based scraper logic (`scraper.py`) that accepts a URL, launches a headless browser, parses `books.toscrape.com` DOM, and returns product data (title, current price, image URL).
3.  Write test cases to mock target site responses and ensure selectors extract the correct values.

### Phase 2: FastAPI API Endpoints
1.  Configure FastAPI routes for:
    *   `POST /api/products` (Tracks a new URL - does immediate scrape, registers product in database)
    *   `GET /api/products` (Lists all tracked products with current prices and alert states)
    *   `PATCH /api/products/{id}` (Updates target price thresholds)
    *   `DELETE /api/products/{id}` (Deletes a tracked product)
    *   `GET /api/products/{id}/history` (Fetches historical price list)
    *   `POST /api/demo/toggle` (Switches APScheduler interval between 1 hour and 10 seconds)

### Phase 3: Background Scheduler & Alerts
1.  Integrate APScheduler running inside FastAPI lifespan.
2.  Define the `check_prices` job: loop through all tracked products, scrape current prices, insert into `PriceHistory`, and compare against `target_price`.
3.  Implement Discord alerting logic (`alerts.py`): build a rich embed JSON payload and dispatch it via HTTP POST. Track triggered status to prevent duplicate alerts.

### Phase 4: Frontend Dashboard & Charts
1.  Build the dashboard UI using React, Tailwind CSS, and shadcn/ui.
2.  Implement the product list layout, track dialog, and target threshold editor.
3.  Integrate Recharts to render a line chart for the selected product showing historical price changes.
4.  Add the Demo Mode switch to easily trigger and demonstrate live updates.
