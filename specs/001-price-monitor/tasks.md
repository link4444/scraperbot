# Tasks: Price Monitor — Web Scraper & Alert System

**Input**: Design documents from `/specs/001-price-monitor/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.md

**Organization**: Tasks are grouped by logical milestones (Setup, Foundational, and User Stories) to enable independent implementation, testing, and execution.

---

## Format: `[ID] [P?] [Story] Description`
*   **[P]**: Can run in parallel (independent files, no resource conflicts).
*   **[Story]**: Maps task to a specific user story (US1, US2, US3, US4, US5).

---

## Phase 1: Setup (Shared Infrastructure)
**Purpose**: Project initialization and folder structure setup.

- [ ] T001 Create backend and frontend folder structure matching the plan
- [ ] T002 Configure Python dependencies in backend/requirements.txt (fastapi, uvicorn, playwritght, sqlmodel, apscheduler, httpx, etc.)
- [ ] T003 [P] Configure Node/Vite project settings and Tailwind CSS in frontend/package.json and tailwind.config.js

---

## Phase 2: Foundational (Blocking Prerequisites)
**Purpose**: Core model definition, database connections, and scraping capabilities.
**⚠️ CRITICAL**: No user story implementation can start until Phase 2 is complete.

- [ ] T004 Setup SQLite database connection and WAL mode initialization in backend/app/database.py
- [ ] T005 [P] Declare SQLModel database entities (Product, PriceHistory) in backend/app/models.py
- [ ] T006 [P] Declare Pydantic validation schemas in backend/app/schemas.py
- [ ] T007 Implement Playwright-based headless scraper function in backend/app/scraper.py
- [ ] T008 [P] Configure logging formats and environmental settings in backend/app/main.py

**Checkpoint**: Core backend infrastructure is ready. Scraper, db schema, and schemas are complete.

---

## Phase 3: User Story 1 - Track Product URL & Immediate Scrape (Priority: P1) 🎯 MVP
**Goal**: User tracks a product URL from the frontend and gets an immediate crawl response stored in SQLite.
**Independent Test**: Send a product URL via POST to backend API, verify SQLite has the book entry with price and image details.

- [ ] T009 [P] [US1] Write unit tests for Playwright selector extraction in backend/tests/test_scraper.py
- [ ] T010 [US1] Implement `POST /api/products` router endpoint in backend/app/main.py (performs immediate crawl via scraper.py, inserts Product and initial PriceHistory)
- [ ] T011 [P] [US1] Implement `GET /api/products` list endpoint in backend/app/main.py
- [ ] T012 [US1] Build UI `AddProductForm` React component in frontend/src/components/AddProductForm.tsx to submit product URLs and target thresholds
- [ ] T013 [US1] Connect frontend form to API endpoints and test immediate crawler workflow end-to-end

**Checkpoint**: MVP track and crawl workflow fully functional.

---

## Phase 4: User Story 2 & 5 - Automated Tracking & Demo Mode (Priority: P1 & P3)
**Goal**: Background scheduler queries prices periodically and allows dynamic 10s demo toggling.
**Independent Test**: Verify scheduler triggers jobs, logs history, and reschedules intervals on demand.

- [ ] T014 [US2] Initialize AsyncIOScheduler running in backend/app/scheduler.py controlled by FastAPI lifespans
- [ ] T015 [US2] Implement background job `check_prices` which crawls active products and inserts new entries into PriceHistory
- [ ] T016 [US5] Implement `POST /api/demo/toggle` endpoint in backend/app/main.py to reschedule APScheduler interval (1 hour vs 10 seconds)
- [ ] T017 [US5] Add Demo Mode status bar and toggle switch in frontend/src/App.tsx

---

## Phase 5: User Story 3 - Discord Webhook Alerting (Priority: P1)
**Goal**: Send rich Embed notifications to Discord when price falls below target.
**Independent Test**: Mock a price drop, run scheduler check, and verify Discord channel receives the webhook.

- [ ] T018 [P] [US3] Create webhook client in backend/app/alerts.py that compiles Discord rich embed JSON payload
- [ ] T019 [US3] Integrate alert trigger logic within `check_prices` job (detect price < target, check and toggle alert_triggered flag)
- [ ] T020 [US3] Add a global "Test Discord Webhook" button and backend test route in backend/app/main.py

---

## Phase 6: User Story 4 - Historical Price Dashboard (Priority: P2)
**Goal**: Display visual dashboard listing cards for all books and rendering price trends.
**Independent Test**: Verify Recharts line chart shows chronological price graph.

- [ ] T021 [P] [US4] Implement `GET /api/products/{id}/history` endpoint in backend/app/main.py
- [ ] T022 [US4] Create React component `ProductCard.tsx` in frontend/src/components/ProductCard.tsx displaying book image, title, threshold, and status status
- [ ] T023 [US4] Create React component `PriceChart.tsx` in frontend/src/components/PriceChart.tsx containing Recharts line chart for the selected book
- [ ] T024 [US4] Integrate dashboard components into frontend/src/App.tsx layout with auto-refresh intervals

---

## Phase 7: Polish & Deployment (Render Setup)
**Purpose**: Performance checking, Docker configuration, and documentation.

- [ ] T025 [P] Create Dockerfile for FastAPI + Playwright compatibility in backend/Dockerfile
- [ ] T026 Build and run validation scenarios to verify no Playwright memory leaks occur on subsequent runs
- [ ] T027 Complete project README.md documenting local setup and deploy actions

---

## Dependencies & Execution Order

### Phase Dependencies
1.  **Setup (Phase 1)**: Can start immediately.
2.  **Foundational (Phase 2)**: Depends on Setup. Blocks all User Stories.
3.  **User Story 1 (Phase 3)**: Core MVP. Must be completed before automated scheduler UI integration.
4.  **Scheduler & Alerts (Phase 4-5)**: Built concurrently after MVP.
5.  **Dashboard Charts (Phase 6)**: Builds on database history endpoints.
6.  **Polish (Phase 7)**: Executed after all story features pass validations.

### Parallel Opportunities
*   T002 and T003 can be run in parallel (backend config vs frontend config).
*   T005, T006, and T007 can be written in parallel (schemas, models, and scraper function are in different files).
*   T009 (scraper tests) can be written in parallel with T010 (crawling route).
*   T018 (alerts dispatcher) can be written in parallel with scheduler setup tasks.
