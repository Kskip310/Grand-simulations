# Grand Simulations

Grand Simulations is a playable baseline cosmic god-simulation sandbox with a FastAPI backend and React + TypeScript frontend.

## Features
- Deterministic seeded universe generation with multiple systems and planets.
- Planet surface maps showing land/water distribution, biome bands, and habitability cues.
- Life/species simulation with population progression and emergent civilization markers.
- Time stepping that mutates real simulation state and persists it in SQLite.
- Save/load support through stored simulations.

## Backend setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

The API is served at `http://127.0.0.1:8000/api`.

## Frontend setup
```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_BASE` if the API is not running at `http://127.0.0.1:8000/api`.

## Test and build
```bash
pytest backend/tests
cd frontend && npm run build
```
