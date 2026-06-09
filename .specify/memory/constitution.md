# Price Monitor — Web Scraper & Alert System Constitution

This Constitution defines the core technical principles, architectural guidelines, coding standards, and quality gates for the Price Monitor project. All code and configurations generated for this repository must strictly adhere to these rules.

---

## 1. Core Architectural Principles

### I. Separated Concerns (Frontend & Backend)
The project is split into a backend web service and a frontend client application:
*   **Backend**: Python 3.11+ using FastAPI. It handles API routing, scheduling, database persistence, scraping logic, and alert dispatches.
*   **Frontend**: React + Tailwind CSS + shadcn/ui (via Vite/Next.js). It handles UI layout, states, Recharts rendering, and calls backend endpoints.
*   **API Protocol**: RESTful JSON API. All input/output schemas must be validated via Pydantic on the backend.

### II. Resilient Scraping
Web scraping must be resilient to changes in target site structure:
*   **Browser Engine**: Playwright async API with headless browser automation.
*   **Isolation**: Every scrape job must run in a fresh, isolated browser context to prevent state leakage (cookies, local storage) and ensure cleanup.
*   **Selector Strategy**: Use robust selectors (e.g., text, roles, or stable attributes like `data-testid`). Avoid deeply nested CSS paths.
*   **Anti-Bot & Rate Limits**: Emulate human navigation behavior (user-agents, viewport size) and include random backoff delays.

### III. Reliable Background Scheduling
The system monitors prices periodically using `APScheduler`:
*   **Lifespan Management**: The scheduler runs inside the FastAPI process, controlled by FastAPI lifespan events (`startup` and `shutdown`).
*   **State Alignment**: Jobs must be dynamically synchronized with the SQLite database. If a user deletes a product or changes the threshold, the scheduled checks must reflect this immediately.
*   **Interval Flexibility**: Must support dynamic interval updates (e.g., hourly in production vs. 10-second intervals in Demo Mode).

### IV. Safe SQLite Persistence
*   **ORM**: SQLAlchemy or SQLModel with async sessions.
*   **Ephemerality Handling**: Render free tier has ephemeral local files. SQLite database must reside on a mounted **Persistent Volume** path (e.g., `/var/data/pricemonitor.db`) configured via environment variables.
*   **Concurrency**: Enable SQLite `WAL` (Write-Ahead Logging) mode to prevent write locks during parallel scrape operations.

---

## 2. Technical Standards & Code Quality

### Python (Backend)
*   **Style**: Strict adherence to PEP 8. Use standard formatting tool (black/ruff) and static analysis (ruff/mypy).
*   **Type Hints**: Strict typing is mandatory for all functions, endpoints, and data models.
*   **Async/Await**: Use async/await for network I/O, database sessions, API endpoints, and Playwright actions.
*   **Error Handling**: Wrap all scraping and network dispatches in try-except blocks. Return informative HTTP status codes and structured JSON errors.

### React & CSS (Frontend)
*   **Component Structure**: Functional components with TypeScript. Reuse shadcn/ui primitives.
*   **Styling**: Tailwind CSS exclusively. No inline styles or custom ad-hoc CSS unless required for dynamic Recharts components.
*   **State Management**: React Context or native `useState`/`useEffect` for local/dashboard state. Use `React Query` or standard fetch hooks for clean API interactions.
*   **Responsiveness**: Mobile-first responsive design using Tailwind screen size prefixes (`sm:`, `md:`, `lg:`).

---

## 3. Alerting & Webhooks
*   **Payload validation**: Validate Discord webhook URLs using regex.
*   **Error Handling**: If Discord webhook dispatches fail (e.g., due to rate limits), implement a retry mechanism with exponential backoff (up to 3 retries) and log failures.
*   **Alert Throttling**: Avoid spamming users. Send an alert only when a price drops below the threshold, and mark the alert as "sent" or record a cooldown period (e.g., do not send again within 24 hours unless the price goes back up and drops again).

---

## 4. Deployment Constraints (Render Free Tier)
*   **Portability**: Port numbers must be configurable via environment variables (`PORT` defaulting to `8000`).
*   **Warm-up Handling**: Render free tier web services spin down after 15 minutes of inactivity. The database connection and scheduler startup must be lightweight enough to initialize under 10 seconds.
*   **Resource Constraints**: Keep memory usage low. Playwright browser instances must be closed immediately after completing a scrape job to avoid out-of-memory errors on Render (512MB RAM limit).

---

## 5. Governance & Compliance
*   All code changes must have associated unit tests using `pytest` (backend) or `vitest` (frontend).
*   No secrets (webhook tokens, database credentials, API keys) must be hardcoded in the codebase. Always load from `.env` or system environment variables.

**Version**: 1.0.0 | **Ratified**: 2026-06-09 | **Last Amended**: 2026-06-09
