# Massachusetts Gateway Cities Dashboard

An interactive data dashboard for exploring foreign-born population demographics across Massachusetts' 26 Gateway Cities using American Community Survey (ACS) 5-year estimates (2012–2024). Built for journalists and researchers to analyze immigration trends, economic assimilation, and community demographics.

---

## Features

### Dashboard Views

- **Overview** — Statewide summary of foreign-born population shares across all MA places
- **Per Capita Comparison** — Side-by-side metric comparisons across cities
- **City Profile** — Deep-dive into a single city's demographics, income, education, and housing
- **Country of Origins** — Granular country-by-country breakdown of foreign-born populations
- **Map View** — Interactive Leaflet map with markers sized/colored by foreign-born share
- **Trends** — Time-series charts (2012–2024) for any metric across cities
- **AI Chatbot** — Conversational interface powered by Google Gemini for natural-language queries

### AI Chatbot Capabilities

The chatbot combines deterministic data analysis with Gemini LLM rewriting. Supported question types:

| Question Type                          | Example                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------- |
| City profile with statewide comparison | "How has the foreign-born population changed in Lowell?"                    |
| Foreign-born population growth ranking | "Which Gateway Cities have had the greatest foreign-born growth?"           |
| Granular country-of-origin breakdown   | "What is the breakdown of foreign-born populations in Lawrence by country?" |
| Fastest-growing subgroups              | "What are the fastest-growing foreign-born subgroups in Lowell?"            |
| Economic assimilation indicators       | "What are the economic indicators for foreign-born in Quincy?"              |
| Economic integration ranking           | "Which cities show the strongest economic integration over time?"           |
| City comparison                        | "How do Gateway Cities compare to other MA cities and statewide averages?"  |
| Trend analysis                         | "What is the foreign-born trend in Chelsea since 2010?"                     |
| Poverty / FB rankings                  | "Which Gateway Cities have the lowest poverty rates?"                       |

---

## Tech Stack

| Layer       | Technology                                          |
| ----------- | --------------------------------------------------- |
| Frontend    | React 19, Vite 7, Recharts, Leaflet / React-Leaflet |
| Backend     | Flask 3, Python 3.12                                |
| Data        | Pandas, PyArrow (Parquet files)                     |
| AI          | Google Gemini API (gemini-2.5-flash)                |
| Data Source | U.S. Census Bureau ACS 5-year estimates             |

---

## Project Structure

```
gateway_cities/
├── backend/
│   ├── app.py                     # Flask API routes (13 endpoints)
│   ├── rag_index/
│   │   └── index.json             # RAG index for chatbot context
│   └── services/
│       ├── chat_service.py        # Chatbot intent routing + Gemini integration
│       ├── data_store.py          # Parquet data loaders for all datasets
│       └── rag.py                 # RAG retrieval utilities
├── data/
│   ├── raw/                       # Original ACS CSV downloads
│   ├── interim/                   # Year-by-year intermediate parquets (2012–2024)
│   └── processed/                 # Final parquet files consumed by the API
│       ├── cities_master.parquet
│       ├── country_of_origin.parquet
│       ├── education.parquet
│       ├── employment_income.parquet
│       ├── foreign_born_core.parquet
│       ├── homeownership.parquet
│       ├── median_income.parquet
│       └── poverty_by_nativity.parquet
├── frontend/
│   ├── public/data/
│   │   └── gateway_cities.geojson # City boundary polygons
│   └── src/
│       ├── App.jsx                # Root component, tab navigation
│       ├── api/cities.js          # API client
│       └── components/
│           ├── ChatBot.jsx        # AI chatbot interface
│           ├── CityProfile.jsx    # Single-city deep-dive
│           ├── CountryOrigins.jsx # Country-of-origin breakdown
│           ├── MapView.jsx        # Leaflet map visualization
│           ├── PerCapitaComparison.jsx  # Cross-city metrics
│           ├── SearchableCitySelect.jsx # City selector dropdown
│           └── TrendsView.jsx     # Time-series charts
├── scripts/
│   ├── fetch_acs_data.py          # Fetch ACS data from Census API
│   ├── fetch_gateway_cities_geojson.py  # Fetch city boundary GeoJSON
│   ├── 00_validate_raw.py         # Step 1: Validate raw CSV downloads
│   ├── 10_normalize_places.py     # Step 2: Normalize city/place names
│   └── 20_build_per_capita_metrics.py   # Step 3: Build per-capita parquets
├── .env                           # Environment variables (API keys)
├── requirements.txt               # Python dependencies
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey) (for the chatbot)

### 1. Clone the repository

```bash
git clone https://github.com/pratrt141098/gateway_cities.git
cd gateway_cities
```

### 2. Backend setup

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
FLASK_ENV=development
DATA_DIR=./data/processed
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

### 4. Frontend setup

```bash
cd frontend
npm install
```

---

## Running Locally

You need **two terminals** open simultaneously.

**Terminal 1 — Backend (Flask)**

```bash
cd gateway_cities
source .venv/bin/activate
python backend/app.py
```

The API runs at **http://localhost:3000**.

**Terminal 2 — Frontend (Vite)**

```bash
cd gateway_cities/frontend
npm run dev
```

The dashboard runs at **http://localhost:5173**.

Open **http://localhost:5173** in your browser.

---

## API Endpoints

| Endpoint                 | Method | Parameters           | Description                        |
| ------------------------ | ------ | -------------------- | ---------------------------------- |
| `/api/health`            | GET    | —                    | Health check                       |
| `/api/cities`            | GET    | —                    | Master list of all cities          |
| `/api/foreign-born`      | GET    | `city`, `city_type`  | Foreign-born population statistics |
| `/api/country-of-origin` | GET    | `city`               | Country-of-origin breakdown        |
| `/api/education`         | GET    | `city`               | Educational attainment             |
| `/api/homeownership`     | GET    | `city`               | Homeownership rates                |
| `/api/employment-income` | GET    | `city`               | Employment and income data         |
| `/api/poverty`           | GET    | `city`               | Poverty rates by nativity          |
| `/api/median-income`     | GET    | `city`               | Median income by nativity          |
| `/api/map-stats`         | GET    | —                    | Map visualization data             |
| `/api/time-series`       | GET    | `city`, `metric`     | Historical data (2012–2024)        |
| `/api/chat`              | POST   | `{"message": "..."}` | AI chatbot                         |

**Available time-series metrics:** `fb_pct`, `unemployment_rate`, `median_income`, `poverty_rate`, `bachelors_pct`, `homeownership_pct`, `fb_income`

---

## Data Pipeline

The processed parquet files are included in the repo. If you need to rebuild them from raw ACS data:

### Step 0: Fetch raw data from Census API

```bash
source .venv/bin/activate
python scripts/fetch_acs_data.py
```

This downloads ACS for all MA places (2012–2024).

### Steps 1–3: Process into parquets

```bash
python scripts/00_validate_raw.py
python scripts/10_normalize_places.py
python scripts/20_build_per_capita_metrics.py
```

### ACS Tables Used

| Table ID | Description                                             |
| -------- | ------------------------------------------------------- |
| B05001   | Nativity in the United States                           |
| B05002   | Place of birth by citizenship status                    |
| B05003   | Nativity by place of birth                              |
| B05006   | Place of birth for foreign-born population              |
| B05010   | Ratio of income to poverty level by nativity            |
| B06011   | Median income by nativity                               |
| B15002   | Sex by educational attainment                           |
| B25003   | Tenure (owner vs renter)                                |
| DP03     | Selected economic characteristics                       |
| S0501    | Selected characteristics of the foreign-born population |

---

## Gateway Cities

The 26 Massachusetts Gateway Cities tracked in this dashboard:

Attleboro, Barnstable, Brockton, Chelsea, Chicopee, Everett, Fall River, Fitchburg, Framingham, Haverhill, Holyoke, Lawrence, Leominster, Lowell, Lynn, Malden, Methuen, New Bedford, Peabody, Pittsfield, Quincy, Revere, Salem, Springfield, Taunton, Worcester

All other Massachusetts places are labeled as **Other Cities in MA** for comparison.

---

## Data Coverage

- **Geographic scope:** 260 Massachusetts places (cities, towns, CDPs)
- **Time range:** 2012–2024
- **Metrics:** Foreign-born share, median income (overall & by nativity), unemployment, poverty, educational attainment, homeownership
- **Country of origin:** 150+ specific countries, grouped by region

---

## License

This project uses publicly available data from the U.S. Census Bureau American Community Survey.
