# Smart energy optimization and demand response

One decision loop: **Forecast → Uncertainty → Optimize → Act → Explain → Measure savings.**

## Run

Backend (terminal 1):
```
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```
API: http://127.0.0.1:8000/docs · API base `/api/v1`

Frontend (terminal 2):
```
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

Or: `docker-compose up --build`. Or `make backend` / `make frontend` / `make test` / `make build`.

## Deploy on Render (one service + Postgres)

`render.yaml` at the repo root provisions everything via Blueprint:

1. Push this repo to GitHub.
2. Render Dashboard → **New → Blueprint** → select the repo → **Apply**.
3. Render creates the web service (`smart-energy-brain`) and a Postgres database,
   generates `SECRET_KEY`, and wires `DATABASE_URL` automatically.
4. First deploy takes a few minutes (pip + npm build). Open the service URL —
   the app serves the UI and the API from the same origin (`/` app, `/api/v1/*`, `/docs`).

Notes:
- The backend serves `frontend/dist` when it exists (local dev is unchanged —
  vite on :5173 still proxies `/api` to the backend).
- Production uses Postgres (`DATABASE_URL`); local dev keeps SQLite.
- Change or remove the demo accounts before any real use; set real API keys
  (NREL, Electricity Maps, PJM, EIA, ENTSO-E, OpenAI/Anthropic) as Render
  environment variables to light up live data sources.

## Login and roles

The app opens at `/login`. Demo accounts (change or remove before any real use):

| User | Password | Can do |
|---|---|---|
| `admin` | `admin123` | Everything: users, seed/reset, dispatch, approvals |
| `operator` | `op123` | Dispatch, black-start actions, approve/reject |
| `manager` | `mgr123` | Forecasts, panels, simulate, compare, export |
| `viewer` | `view123` | Read-only dashboards and reports |

Security: passwords are PBKDF2-hashed (never stored plain), sessions are expiring
JWTs signed with `SECRET_KEY` (set a real one in `.env`), 5 wrong logins lock an
account for 5 minutes, viewers are read-only by construction, and only admins can
manage users or wipe the ledger. Full test suite: `cd backend && python -m pytest tests -q`.

## What works (all offline, synthetic by default)
- Overview: KPI strip, 24h decision timeline with scrubber, asset flow, approvals queue, Simulate-a-day.
- Forecast (Solar): lat/lon/capacity/horizon → P10/P50/P90, variability index, cloud-motion vector + animated frames.
- Demand: quantile forecast, feature importance, backtest MAPE/pinball.
- Dispatch (VPP): baseline vs smart, λ/μ sliders, feeder limit, per-EV SoC guarantee + fairness note.
- Recovery (Grid): 4 failure scenarios, 6-step deterministic simulator, SVG re-energization, copilot chat with doc+step citations, human-in-the-loop badge.
- Panels: 3 synthetic thermal samples (or upload), OpenCV defects, overlay, money/kWh loss.
- Ledger: cumulative savings/CO2/peak, entries, CSV export, print, seed/reset, methodology.
- Trust: provenance, fairness, failure modes, override log. Settings: region/currency/tariff/carbon switch, integrations live-vs-synthetic, model status, API docs link.
- Command palette (Cmd/Ctrl+K), light/dark, responsive, 404 page.

## Verified
- Backend: `cd backend && python -m pytest tests -q` → 13 passed (bands monotonic, SoC guarantee, motion tolerance, copilot cites, approvals).
- Frontend: `cd frontend && npm run build` → passes, no TS errors.

## Regions
`bd-dhaka` (BDT, evening peak, 670 g/kWh), `de-berlin` (EUR, day-ahead), `us-pjm` (USD, LMP). Switching updates tariffs, currency, carbon everywhere.

## Live data (optional)
Copy `.env.example` to `.env` and set keys. Without keys everything falls back to synthetic with `source: "synthetic"` shown honestly.
