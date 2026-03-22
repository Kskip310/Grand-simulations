from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CreateSimulationRequest(BaseModel):
    seed: int = Field(default=1337)
    name: str | None = Field(default=None, max_length=120)


class StepSimulationRequest(BaseModel):
    steps: int = Field(default=1, ge=1, le=25)


class SimulationSummary(BaseModel):
    id: str
    name: str
    seed: int
    created_at: str
    updated_at: str
    metrics: dict[str, Any]
    current_step: int


class SurfaceCell(BaseModel):
    x: int
    y: int
    elevation: float
    moisture: float
    temperature: float
    biome: str
    label: str
    has_water: bool
    habitability: float


class Species(BaseModel):
    id: str
    name: str
    adaptation: str
    stage: str
    population: int
    growth_bias: float
    resilience: float


class LifeOverview(BaseModel):
    present: bool
    species_count: int
    dominant_species: str | None
    civilization: dict[str, Any] | None
    biosphere_score: float


class Planet(BaseModel):
    id: str
    name: str
    orbit_index: int
    radius_km: int
    surface: list[list[SurfaceCell]]
    metrics: dict[str, Any]
    species: list[Species]
    life: LifeOverview
    season_phase: float
    anomaly: str


class System(BaseModel):
    id: str
    name: str
    x: float
    y: float
    star_type: str
    luminosity: float
    planets: list[Planet]


class SimulationState(BaseModel):
    id: str
    name: str
    seed: int
    current_step: int
    systems: list[System]
    metrics: dict[str, Any]
