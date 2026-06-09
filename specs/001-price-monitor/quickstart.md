# Quickstart & Validation Scenarios

This guide details how to spin up and test the Price Monitor application locally.

---

## 1. Local Development Setup

### Backend (Python)
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create and activate virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate
    ```
3.  Install requirements:
    ```bash
    pip install -r requirements.txt
    ```
4.  Install Playwright browser binaries:
    ```bash
    playwright install chromium
    ```
5.  Set environment variables:
    ```bash
    export DATABASE_URL="sqlite:///./pricemonitor.db"
    export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/your-mock-webhook"
    ```
6.  Start uvicorn server:
    ```bash
    uvicorn app.main:app --reload --port 8000
    ```

### Frontend (React + Vite)
1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install packages:
    ```bash
    npm install
    ```
3.  Start development server:
    ```bash
    npm run dev
    ```

---

## 2. API Validation Commands (CLI Curl)

Verify the backend service is operational using `curl`.

### 1. Add/Track a Product (Immediate Scrape)
```bash
curl -X POST http://localhost:8000/api/products \
     -H "Content-Type: application/json" \
     -d '{
       "url": "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
       "target_price": 50.00
     }'
```
*Expected Output*: Returns `201 Created` with full product info (title, scraped price, image URL).

### 2. List Tracked Products
```bash
curl http://localhost:8000/api/products
```
*Expected Output*: Array of active tracked products.

### 3. Update Target Price Threshold
```bash
curl -X PATCH http://localhost:8000/api/products/1 \
     -H "Content-Type: application/json" \
     -d '{
       "target_price": 53.00
     }'
```
*Expected Output*: Returns updated product model.

### 4. Toggle Demo Mode (Dynamic Intervals)
```bash
curl -X POST http://localhost:8000/api/demo/toggle?demo=true
```
*Expected Output*: Returns `{"status": "success", "demo_mode": true, "interval": "10s"}`.

---

## 3. End-to-End Validation Scenario

1.  **Open Dashboard**: Access `http://localhost:5173`.
2.  **Configure Discord Alert**: In backend env, specify a valid Discord test webhook.
3.  **Track Product**:
    *   Add URL: `http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html` (Original price: £51.77)
    *   Set target price: `50.00`.
    *   Click "Track". Verify the product card appears instantly with thumbnail image, current price `£51.77`, and target price `£50.00`.
4.  **Activate Demo Mode**: Toggle "Demo Mode" switch to ON. Check console or backend logs showing scrape job running every 10 seconds.
5.  **Trigger Price Drop Alert**:
    *   Update target price of "A Light in the Attic" to `53.00` (which is *higher* than the current price of `51.77`).
    *   Wait for the next 10-second tick.
    *   **Verify Alert**:
        *   Discord channel receives a rich Embed notification.
        *   Product card status changes to `Triggered` and card highlights.
