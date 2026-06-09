# Feature Specification: Price Monitor — Web Scraper & Alert System

**Feature Branch**: `001-price-monitor`

**Created**: 2026-06-09

**Status**: Approved

**Input**: User description: "Web scraper & price monitor dashboard using FastAPI, React, SQLite, Playwright, APScheduler, and Discord webhooks."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track Product URL & Immediate Scrape (Priority: P1) 🎯 MVP
**As a** bargain hunter,  
**I want to** paste a product URL from a bot-friendly e-commerce site and click "Track",  
**So that** the app immediately extracts the current price, title, and image, saving them to the database.

*   **Why this priority**: It is the core entry point of the application. Without immediate scraping and tracking, the monitor cannot function.
*   **Independent Test**: Can be tested by running the backend scraper service against a mock product URL, asserting that it returns the correct title, price, and image.
*   **Acceptance Scenarios**:
    1.  **Given** the user is on the dashboard, **When** they paste a valid URL (e.g., from `books.toscrape.com`) and click "Add Product", **Then** a loading indicator appears, Playwright launches, extracts the data, adds the product to the list with its image and title, and saves the initial price entry in the database.
    2.  **Given** an invalid or unsupported URL is entered, **When** the user clicks "Add Product", **Then** the application displays a friendly validation error toast without crashing.

---

### User Story 2 - Set Price Threshold & Active Monitoring (Priority: P1) 🎯 MVP
**As a** budget-conscious shopper,  
**I want to** set a target price for any tracked product,  
**So that** the system regularly checks the price in the background and knows when it drops below my target.

*   **Why this priority**: Automated price checking is the primary business value of a price monitor.
*   **Independent Test**: Can be tested by manually scheduling a check or running the monitoring job in pytest, asserting that the price changes are logged and recorded in the database.
*   **Acceptance Scenarios**:
    1.  **Given** a product is tracked, **When** the user edits the "Target Price" field, **Then** the backend updates the target threshold in the SQLite database.
    2.  **Given** the scheduler is running on its hourly interval, **When** the hour mark is reached, **Then** it triggers a background scraping job for all active products, inserting a new record into the price history table.

---

### User Story 3 - Discord Webhook Alerting (Priority: P1)
**As a** user who doesn't check the app constantly,  
**I want to** receive an instant message on Discord when the price falls below my target,  
**So that** I can buy the product before the price goes back up.

*   **Why this priority**: Real-time alerting closes the feedback loop and provides immediate utility.
*   **Independent Test**: Mock the scraping output to return a price lower than the target threshold, run the alert script, and verify that a webhook payload is successfully dispatched to a Discord test channel.
*   **Acceptance Scenarios**:
    1.  **Given** a product has a target price of $20 and current price of $25, **When** the background scraper detects the price dropped to $18, **Then** the app sends a rich Discord Embed containing the product image, title, price drop percentage, and target price.
    2.  **Given** an alert was already sent for a price drop, **When** the next schedule check runs and the price is still below target, **Then** the system does NOT send a duplicate alert (alert state is tracked to prevent webhook spamming).

---

### User Story 4 - Visual Price History Dashboard (Priority: P2)
**As a** visual-oriented shopper,  
**I want to** view a interactive line chart showing the price of a product over time,  
**So that** I can analyze historical price fluctuations and decide if the current price is a good deal.

*   **Why this priority**: Provides visual confirmation that the background scheduler is working and delivers data analytics.
*   **Independent Test**: Provide mock historical data to the frontend chart component and verify that the Recharts line graph renders correctly with timestamps on the X-axis.
*   **Acceptance Scenarios**:
    1.  **Given** a tracked product has multiple historical price points, **When** the user selects the product on the dashboard, **Then** a clean line chart (Recharts) renders showing the price history.

---

### User Story 5 - Live Demo Mode Toggle (Priority: P3)
**As a** hackathon presenter,  
**I want to** toggle a "Demo Mode" switch that changes the scheduler interval to 10 seconds,  
**So that** I can show the live scraping, database update, and Discord notification cycle in real-time.

*   **Why this priority**: Essential for presentation success within a limited hackathon demo window.
*   **Independent Test**: Toggle Demo Mode via API, check that the active APScheduler trigger is updated to a 10-second interval, and verify it checks prices every 10 seconds.
*   **Acceptance Scenarios**:
    1.  **Given** the app is running in standard mode (hourly), **When** the user toggles "Demo Mode" on the dashboard, **Then** the scheduler dynamically reschedules jobs to run every 10 seconds, and the UI status indicator turns green with text "Demo Mode Active (10s checks)".

---

## Edge Cases & Error Handling

1.  **Anti-Bot Blocking / Captcha**: Target sites might block the scraper.
    *   *Mitigation*: Use headless browser arguments to mask automated execution (e.g., standard viewport, custom User-Agent). The target site is designated as `books.toscrape.com` (a sandbox e-commerce page designed for scraping practice) to guarantee 100% success during the hackathon demo.
2.  **Product Removed / 404 Pages**: The product page is deleted or URL becomes invalid.
    *   *Mitigation*: If Playwright receives a 404 status code or fails to locate the price selector, the product status is updated to `Error` and the failure is logged.
3.  **Discord Webhook Rate Limits**: Discord limits webhook dispatches if triggered too quickly.
    *   *Mitigation*: The app implements a cooldown state per product. Once an alert triggers, no further alerts are sent until the price rises above the threshold again, or the user manually resets the trigger status on the dashboard.

---

## Requirements *(mandatory)*

### Functional Requirements
*   **FR-001**: The system MUST scrape product title, current price, and image URL immediately upon adding a product.
*   **FR-002**: The system MUST store products and price history in a local SQLite database file located in a persistent directory.
*   **FR-003**: The backend MUST expose a REST API using FastAPI for listing products, adding new products, updating target thresholds, fetching history, and toggling Demo Mode.
*   **FR-004**: The background scheduler MUST run concurrently in the FastAPI application process and run periodic checks.
*   **FR-005**: The system MUST dispatch a Discord Webhook request containing a rich embed with product details and a direct URL link when the target threshold is met.
*   **FR-006**: The frontend dashboard MUST be a responsive React app displaying cards for tracked products, alerts status, and a line chart of price trends over time.

---

### Key Entities

1.  **Product**:
    *   `id`: UUID or Integer (Primary Key)
    *   `url`: String (Unique)
    *   `title`: String
    *   `image_url`: String
    *   `current_price`: Float
    *   `target_price`: Float
    *   `alert_triggered`: Boolean (Default: false)
    *   `status`: String (e.g., `Active`, `Triggered`, `Error`)
    *   `created_at`: DateTime
2.  **PriceHistory**:
    *   `id`: Integer (Primary Key)
    *   `product_id`: Integer (Foreign Key to Product)
    *   `price`: Float
    *   `scraped_at`: DateTime

---

## Success Criteria

*   **SC-001**: Immediate scraping takes less than 5 seconds from pasting a URL to rendering on the dashboard.
*   **SC-002**: Price drop detection triggers a Discord notification in under 2 seconds from the scrape completion.
*   **SC-003**: The app runs successfully on Render's free tier without exceeding the 512MB RAM threshold (ensured by closing Playwright browser instances immediately).

---

## Assumptions & Clarifications

*   **Target Site**: The default target site for scraping is `books.toscrape.com` or `quotes.toscrape.com` to guarantee reliable demo behavior without anti-bot blocks.
*   **Discord Webhook**: Configured globally in the backend environment file `.env` via `DISCORD_WEBHOOK_URL` to simplify deployment, but can be updated via a settings interface on the dashboard.
*   **Database Location**: Stored at `/data/pricemonitor.db` on Render (using a persistent disk mount) and locally at `./pricemonitor.db` for development.
