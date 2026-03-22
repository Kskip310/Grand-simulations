from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import CreateSimulationRequest, InfluenceRequest, SimulationState, SimulationSummary, StepSimulationRequest
from .simulation import apply_influence, generate_simulation, normalize_state, step_simulation
from .storage import init_db, list_simulations, load_simulation, save_simulation


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Grand Simulations API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/simulations", response_model=list[SimulationSummary])
def simulations() -> list[dict]:
    return list_simulations()


@app.post("/api/simulations", response_model=SimulationState)
def create_simulation(request: CreateSimulationRequest) -> dict:
    state = generate_simulation(seed=request.seed, name=request.name)
    save_simulation(state)
    return state


@app.get("/api/simulations/{simulation_id}", response_model=SimulationState)
def get_simulation(simulation_id: str) -> dict:
    state = load_simulation(simulation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    normalized = normalize_state(state)
    save_simulation(normalized)
    return normalized


@app.post("/api/simulations/{simulation_id}/step", response_model=SimulationState)
def step_existing_simulation(simulation_id: str, request: StepSimulationRequest) -> dict:
    state = load_simulation(simulation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    normalized = normalize_state(state)
    next_state = step_simulation(normalized, steps=request.steps)
    save_simulation(next_state)
    return next_state


@app.post("/api/simulations/{simulation_id}/planets/{planet_id}/influence", response_model=SimulationState)
def influence_planet(simulation_id: str, planet_id: str, request: InfluenceRequest) -> dict:
    state = load_simulation(simulation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    normalized = normalize_state(state)
    try:
        next_state = apply_influence(normalized, planet_id=planet_id, action=request.action)
    except ValueError as error:
        message = str(error)
        status_code = 404 if message.startswith("Planet not found") else 400
        raise HTTPException(status_code=status_code, detail=message) from error
    save_simulation(next_state)
    return next_state
