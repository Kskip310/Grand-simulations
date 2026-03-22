from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from typing import Any

GRID_WIDTH = 24
GRID_HEIGHT = 12
BIOME_PALETTE = {
    "ocean": "Deep Ocean",
    "reef": "Reef",
    "ice": "Glacier",
    "desert": "Desert",
    "grassland": "Grassland",
    "forest": "Forest",
    "rainforest": "Rainforest",
    "tundra": "Tundra",
    "mountain": "Mountain",
    "wetland": "Wetland",
    "volcanic": "Volcanic",
}


@dataclass(frozen=True)
class SpeciesTemplate:
    name: str
    adaptation: str
    growth_bias: float


SPECIES_TEMPLATES = [
    SpeciesTemplate("Aerial Mycelids", "spore-cloud colonies", 0.92),
    SpeciesTemplate("Glassback Grazers", "silica shell herds", 1.05),
    SpeciesTemplate("Tide Singers", "coastal hive minds", 1.08),
    SpeciesTemplate("Ember Ferns", "geothermal flora", 0.97),
    SpeciesTemplate("Cobalt Striders", "cold steppe hunters", 1.02),
    SpeciesTemplate("Sunveil Polyps", "reef bloom networks", 1.11),
]


def _stable_hash(*parts: Any) -> int:
    payload = "::".join(str(part) for part in parts).encode("utf-8")
    return int(hashlib.sha256(payload).hexdigest(), 16)


def _rng(*parts: Any) -> random.Random:
    return random.Random(_stable_hash(*parts))


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def _noise(seed: int, x: int, y: int, scale: float) -> float:
    angle = (seed % 10_000) * 0.001 + x * 1.3123 + y * 2.1717
    wobble = math.sin(angle * scale) + math.cos((angle + seed * 0.0001) * scale * 0.63)
    return wobble / 2.0


def _choose_biome(elevation: float, moisture: float, temperature: float, volcanic: float) -> str:
    if elevation < 0.28:
        if temperature > 0.72 and moisture > 0.58:
            return "reef"
        return "ocean"
    if temperature < 0.18:
        return "ice" if elevation < 0.55 else "mountain"
    if volcanic > 0.86:
        return "volcanic"
    if elevation > 0.82:
        return "mountain"
    if moisture < 0.2:
        return "desert"
    if moisture > 0.78:
        return "rainforest" if temperature > 0.55 else "wetland"
    if temperature < 0.32:
        return "tundra"
    if moisture > 0.56:
        return "forest"
    return "grassland"


def _surface_grid(seed: int, system_index: int, planet_index: int) -> list[list[dict[str, Any]]]:
    planet_seed = _stable_hash(seed, system_index, planet_index)
    grid: list[list[dict[str, Any]]] = []
    for y in range(GRID_HEIGHT):
        row: list[dict[str, Any]] = []
        latitude = abs((y / (GRID_HEIGHT - 1)) * 2 - 1)
        for x in range(GRID_WIDTH):
            elevation = 0.5 + _noise(planet_seed, x, y, 0.9) * 0.22 + _noise(planet_seed + 19, x, y, 2.3) * 0.14
            elevation = _clamp(elevation, 0.0, 1.0)
            moisture = 0.48 + _noise(planet_seed + 101, x, y, 1.2) * 0.25 - latitude * 0.18
            moisture = _clamp(moisture, 0.0, 1.0)
            temperature = 0.9 - latitude * 0.72 + _noise(planet_seed + 202, x, y, 1.5) * 0.18
            temperature = _clamp(temperature, 0.0, 1.0)
            volcanic = _clamp(0.5 + _noise(planet_seed + 303, x, y, 2.7) * 0.45, 0.0, 1.0)
            biome = _choose_biome(elevation, moisture, temperature, volcanic)
            row.append(
                {
                    "x": x,
                    "y": y,
                    "elevation": round(elevation, 3),
                    "moisture": round(moisture, 3),
                    "temperature": round(temperature, 3),
                    "biome": biome,
                    "label": BIOME_PALETTE[biome],
                    "has_water": elevation < 0.28,
                    "habitability": round(_clamp((moisture * 0.5 + temperature * 0.35 + elevation * 0.15), 0.0, 1.0), 3),
                }
            )
        grid.append(row)
    return grid


def _aggregate_metrics(surface: list[list[dict[str, Any]]]) -> dict[str, float]:
    cells = [cell for row in surface for cell in row]
    water_ratio = sum(1 for cell in cells if cell["has_water"]) / len(cells)
    avg_temp = sum(cell["temperature"] for cell in cells) / len(cells)
    avg_moisture = sum(cell["moisture"] for cell in cells) / len(cells)
    habitability = sum(cell["habitability"] for cell in cells) / len(cells)
    return {
        "water_ratio": round(water_ratio, 3),
        "avg_temperature": round(avg_temp, 3),
        "avg_moisture": round(avg_moisture, 3),
        "habitability": round(habitability, 3),
    }


def _spawn_species(seed: int, planet_id: str, metrics: dict[str, float]) -> list[dict[str, Any]]:
    species_rng = _rng(seed, planet_id, "species")
    capacity = 0
    if metrics["habitability"] > 0.58:
        capacity += 1
    if metrics["water_ratio"] > 0.33 and metrics["avg_temperature"] > 0.35:
        capacity += 1
    if metrics["avg_moisture"] > 0.45:
        capacity += 1
    capacity = max(0, min(capacity, 3))
    species: list[dict[str, Any]] = []
    for index in range(capacity):
        template = SPECIES_TEMPLATES[(species_rng.randint(0, 999) + index) % len(SPECIES_TEMPLATES)]
        base_population = int(40 + metrics["habitability"] * 120 + species_rng.randint(0, 50))
        species.append(
            {
                "id": f"{planet_id}-species-{index}",
                "name": template.name,
                "adaptation": template.adaptation,
                "stage": "biosphere" if base_population < 160 else "toolmakers",
                "population": base_population,
                "growth_bias": template.growth_bias,
                "resilience": round(_clamp(0.45 + metrics["habitability"] * 0.4 + species_rng.random() * 0.2, 0.0, 1.0), 3),
            }
        )
    return species


def _life_overview(species: list[dict[str, Any]]) -> dict[str, Any]:
    if not species:
        return {
            "present": False,
            "species_count": 0,
            "dominant_species": None,
            "civilization": None,
            "biosphere_score": 0.0,
        }
    dominant = max(species, key=lambda item: item["population"])
    civilization = None
    if dominant["population"] >= 180:
        civilization = {
            "name": f"{dominant['name']} Accord",
            "tier": "emergent",
            "stability": round(min(1.0, dominant["resilience"] + dominant["population"] / 500), 3),
        }
    biosphere_score = round(sum(item["population"] for item in species) / max(1, len(species)) / 200, 3)
    return {
        "present": True,
        "species_count": len(species),
        "dominant_species": dominant["name"],
        "civilization": civilization,
        "biosphere_score": biosphere_score,
    }


def _planet_summary(seed: int, system_index: int, planet_index: int) -> dict[str, Any]:
    planet_id = f"sys-{system_index}-planet-{planet_index}"
    surface = _surface_grid(seed, system_index, planet_index)
    metrics = _aggregate_metrics(surface)
    radius_rng = _rng(seed, planet_id, "radius")
    species = _spawn_species(seed, planet_id, metrics)
    return {
        "id": planet_id,
        "name": f"P-{system_index + 1}.{planet_index + 1}",
        "orbit_index": planet_index,
        "radius_km": radius_rng.randint(2800, 9200),
        "surface": surface,
        "metrics": metrics,
        "species": species,
        "life": _life_overview(species),
        "season_phase": 0.0,
        "anomaly": ["aurora belts", "ring storms", "crystal tides", "deep vents"][radius_rng.randint(0, 3)],
    }


def _system_summary(seed: int, system_index: int) -> dict[str, Any]:
    system_rng = _rng(seed, system_index)
    planets = [_planet_summary(seed, system_index, planet_index) for planet_index in range(system_rng.randint(3, 5))]
    return {
        "id": f"system-{system_index}",
        "name": f"Helios Node {system_index + 1}",
        "x": round(system_rng.uniform(8, 92), 2),
        "y": round(system_rng.uniform(10, 88), 2),
        "star_type": system_rng.choice(["G", "K", "M", "F"]),
        "luminosity": round(system_rng.uniform(0.4, 1.8), 2),
        "planets": planets,
    }


def generate_simulation(seed: int, name: str | None = None) -> dict[str, Any]:
    universe_rng = _rng(seed, "universe")
    systems = [_system_summary(seed, index) for index in range(universe_rng.randint(3, 5))]
    total_species = sum(len(planet["species"]) for system in systems for planet in system["planets"])
    habitable_worlds = sum(1 for system in systems for planet in system["planets"] if planet["metrics"]["habitability"] > 0.55)
    return {
        "id": f"sim-{seed}",
        "name": name or f"Grand Simulation {seed}",
        "seed": seed,
        "current_step": 0,
        "systems": systems,
        "metrics": {
            "system_count": len(systems),
            "planet_count": sum(len(system["planets"]) for system in systems),
            "species_count": total_species,
            "habitable_worlds": habitable_worlds,
        },
    }


def step_simulation(state: dict[str, Any], steps: int = 1) -> dict[str, Any]:
    if steps < 1:
        return state
    for _ in range(steps):
        state["current_step"] += 1
        for system in state["systems"]:
            for planet in system["planets"]:
                phase = (planet["season_phase"] + 0.18) % (math.pi * 2)
                climate_delta = math.sin(state["current_step"] * 0.4 + planet["orbit_index"] * 0.8) * 0.025
                moisture_delta = math.cos(state["current_step"] * 0.33 + len(planet["species"])) * 0.02
                metrics = planet["metrics"]
                metrics["avg_temperature"] = round(_clamp(metrics["avg_temperature"] + climate_delta, 0.0, 1.0), 3)
                metrics["avg_moisture"] = round(_clamp(metrics["avg_moisture"] + moisture_delta, 0.0, 1.0), 3)
                metrics["habitability"] = round(
                    _clamp(
                        metrics["habitability"] + climate_delta * 0.45 + moisture_delta * 0.55,
                        0.0,
                        1.0,
                    ),
                    3,
                )
                metrics["water_ratio"] = round(_clamp(metrics["water_ratio"] + moisture_delta * 0.18, 0.0, 1.0), 3)
                planet["season_phase"] = round(phase, 3)
                for species in planet["species"]:
                    climate_pressure = 1 + (metrics["habitability"] - 0.5) * species["growth_bias"]
                    next_population = int(max(0, species["population"] * climate_pressure + 4))
                    species["population"] = next_population
                    if next_population >= 240:
                        species["stage"] = "civilization"
                    elif next_population >= 160:
                        species["stage"] = "toolmakers"
                    elif next_population > 0:
                        species["stage"] = "biosphere"
                    else:
                        species["stage"] = "extinct"
                planet["species"] = [species for species in planet["species"] if species["population"] > 0]
                if not planet["species"] and metrics["habitability"] > 0.72:
                    newcomer = _spawn_species(state["seed"] + state["current_step"], planet["id"], metrics)
                    planet["species"] = newcomer[:1]
                planet["life"] = _life_overview(planet["species"])
        state["metrics"] = {
            "system_count": len(state["systems"]),
            "planet_count": sum(len(system["planets"]) for system in state["systems"]),
            "species_count": sum(len(planet["species"]) for system in state["systems"] for planet in system["planets"]),
            "habitable_worlds": sum(
                1
                for system in state["systems"]
                for planet in system["planets"]
                if planet["metrics"]["habitability"] > 0.55
            ),
        }
    return state
