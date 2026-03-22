from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import CreateSimulationRequest, SimulationState, SimulationSummary, StepSimulationRequest
from .simulation import generate_simulation, step_simulation
from .storage import init_db, list_simulations, load_simulation, save_simulation


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Grand Simulations API", version="0.1.0", lifespan=lifespan)
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
    return state


@app.post("/api/simulations/{simulation_id}/step", response_model=SimulationState)
def step_existing_simulation(simulation_id: str, request: StepSimulationRequest) -> dict:
    state = load_simulation(simulation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    next_state = step_simulation(state, steps=request.steps)
    save_simulation(next_state)
    return next_state
