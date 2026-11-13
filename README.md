## 🚀 Live Project

**Live Application:** https://windvision-energy-app-tau.vercel.app/

**GitHub Repository:** https://github.com/shreyas-k-01/windvision-energy-app

**Backend API:** https://windvision-api.onrender.com

**API Documentation:** https://windvision-api.onrender.com/docs

## 🛠 Technology Stack

- Frontend: React.js, Vite
- Backend: Python, FastAPI
- Data Source: Elexon BMRS API
- Containerization: Docker
- Frontend Deployment: Vercel
- Backend Deployment: Render

## 📌 Project Overview

WindVision is a day-ahead wind generation forecasting and decision-support application designed to help electricity procurement teams understand forecasted wind generation and evaluate historical forecast accuracy.

It uses Elexon BMRS wind forecast and actual generation data to analyse forecast errors and provide insights for procurement decisions.

# WindVision — Day-ahead Wind Forecast Decision Support

WindVision is a React + FastAPI pilot for a UK electricity utility's day-ahead procurement team. It answers the two requirements in the supplied challenge: (1) show the latest Elexon wind generation forecast available at a selected decision cutoff, and (2) quantify how accurate those forecasts were against actual wind generation.

## What a decision-maker sees

The app opens directly on **Decision brief**. Select a January 2026 decision date and UK decision cutoff. WindVision then shows:

- The average wind forecast for the following delivery day.
- The latest forecast publication used, hourly forecast availability, and how many publication vintages contribute to the profile.
- An hourly forecast-versus-actual chart.
- A row-by-row audit showing the delivery hour, selected forecast publication time, forecast MW, actual MW, and forecast error.
- Historical January accuracy metrics: MAE, RMSE, MAPE, and forecast bias.
- The delivery days with the largest historical forecast errors.
- CSV export of the hourly records.

The forecast is selected independently for every delivery hour using the latest publication at or before the decision cutoff. FUELHH actuals are supplied at half-hour resolution; the backend averages the two half-hour readings in each hour to compare them with the hourly WINDFOR forecast records.

## Challenge scope and important interpretation

The challenge explicitly limits this pilot to national-level Elexon wind forecast and actual-generation data only. Therefore, this project does **not** fabricate electricity demand, market prices, other generation, existing contracts, or a purchase quantity. It supports the buyer by making the wind supply forecast visible at the decision cutoff and showing the quantitative forecast error that should inform procurement judgement.

Actual generation is shown only for retrospective evaluation; it was not known at the original day-ahead decision time. The full-month January accuracy metrics are a retrospective backtest and must not be described as information available at the start of January. Positive forecast bias means forecast MW exceeded actual MW on average.

## Project structure

```text
WindVision-project/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py        # Environment configuration
│   │   ├── elexon.py        # Elexon BMRS API client
│   │   ├── analysis.py      # Forecast vintage selection and metrics
│   │   └── main.py          # FastAPI endpoints and short in-memory cache
│   ├── tests/
│   │   └── test_analysis.py # Forecast cutoff, hourly aggregation and metrics tests
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Decision brief, hourly forecast and accuracy screens
│   │   ├── api.js           # React-to-FastAPI client
│   │   ├── main.jsx         # React entry point
│   │   └── styles.css       # Responsive dashboard styling
│   ├── Dockerfile
│   ├── nginx.conf           # Static frontend and /api reverse proxy
│   ├── package.json
│   └── vite.config.js       # Local development API proxy
├── docker-compose.yml
├── render.yaml
├── vercel.json
└── README.md
```

## Run locally with Docker

From the repository root (the folder containing `docker-compose.yml`):

```powershell
docker compose up --build
```

Open:

- Frontend: http://localhost:8080
- Backend health check: http://localhost:8000/api/health
- Backend API documentation: http://localhost:8000/docs

Stop the services with:

```powershell
docker compose down
```

## Run locally without Docker

Backend terminal:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8000` by default. Open the Vite URL shown in the terminal (normally http://localhost:5173).

## Deploy

### 1. Push the project to GitHub

Create a **public repository with an anonymous/random name**, as requested in the challenge. Push the complete repository root, including `backend/`, `frontend/`, `render.yaml`, and `vercel.json`. Do not commit local `.env` files, credentials, or virtual environments.

### 2. Deploy the Python API on Render

1. In Render, choose **New → Blueprint** and connect the GitHub repository.
2. Render reads the root `render.yaml`, which builds the existing backend Dockerfile in `backend/`.
3. In the Render service environment settings, set `ALLOWED_ORIGINS` to your Vercel origin, for example `https://YOUR-APP.vercel.app` (no trailing slash). The Render blueprint marks this value as manually supplied.
4. The backend Dockerfile listens on Render’s assigned `PORT` and defaults to port 8000 under local Docker Compose.
5. Wait for the service to deploy. Verify `https://YOUR-API.onrender.com/api/health` returns a JSON status response.

### 3. Deploy the React frontend on Vercel

1. Import the same GitHub repository into Vercel.
2. Keep the repository root as the project root. The root `vercel.json` installs and builds the frontend from `frontend/` and publishes `frontend/dist`.
3. Add the environment variable `VITE_API_BASE` for Production (and Preview if required):

   `https://YOUR-API.onrender.com/api`

   Replace the sample host with your actual Render service URL. Keep the `/api` suffix.
4. Deploy or redeploy. Open the Vercel URL and verify that the dashboard loads data. If the browser reports a CORS error, confirm the Render `ALLOWED_ORIGINS` value exactly matches the Vercel origin, then redeploy the backend.

The frontend is hosted on Vercel and the Python API on Render. The app continues to use Docker for local development and the Render backend deployment.

## Tests

From the `backend/` directory, run:

```powershell
python -m unittest discover -s tests -v
```

The tests cover error metric calculations, half-hour-to-hour actual aggregation, exclusion of forecasts published after the cutoff, and the January decision/delivery window.

## AI assistance

AI tools were used to assist with implementation, debugging, and documentation. The resulting code and outputs should be reviewed by the developer before submission.

## Challenge deliverables still to complete

- Record an unlisted demo video no longer than 10 minutes: up to 5 minutes pitching the product to the client and up to 5 minutes explaining architecture, design, analysis, code and development practices to a technical reviewer.
- Add the deployed Vercel URL to the submission details and verify it in an incognito browser window.
- Submit the public repository and video details through the supplied challenge form.
