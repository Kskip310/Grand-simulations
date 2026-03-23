from __future__ import annotations

import hashlib
import math
import random
import uuid
from dataclasses import dataclass
from typing import Any

GRID_WIDTH = 24
GRID_HEIGHT = 12
MAX_ALERTS = 36
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

WORLD_INFLUENCE_EFFECTS = {
    "warm_atmosphere": {"temperature_drift": 0.09},
    "cool_atmosphere": {"temperature_drift": -0.09},
    "enrich_rains": {"moisture_drift": 0.09},
    "dry_currents": {"moisture_drift": -0.09},
    "fertility_blessing": {"fertility": 0.12},
    "stir_mutation": {"mutation_pressure": 0.12},
    "stabilize_world": {"environmental_stability": 0.12},
    "enrich_resources": {"resource_richness": 0.12},
    "raise_disasters": {"disaster_pressure": 0.16},
    "protect_biosphere": {"protection": 0.14, "environmental_stability": 0.06},
    "biosphere_seeding": {"fertility": 0.22, "protection": 0.08},
    "cataclysm": {"disaster_pressure": 0.26, "environmental_stability": -0.12},
}

CULTURE_INFLUENCE_EFFECTS = {
    "encourage_cooperation": {"cooperation_bias": 0.14},
    "encourage_conflict": {"conflict_bias": 0.14},
    "encourage_curiosity": {"curiosity_bias": 0.14},
    "encourage_caution": {"caution_bias": 0.14},
    "encourage_invention": {"invention_bias": 0.16},
    "encourage_agriculture": {"agriculture_bias": 0.16},
    "encourage_navigation": {"navigation_bias": 0.16},
    "encourage_astronomy": {"astronomy_bias": 0.16},
    "encourage_spirituality": {"spirituality_bias": 0.14},
    "suppress_collapse": {"collapse_suppression": 0.16},
    "increase_expansion_drive": {"expansion_drive_bias": 0.16},
}

DIRECT_ACTIONS = {"biosphere_seeding", "cataclysm", "protect_biosphere"}


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


def _has_water(elevation: float, moisture: float, temperature: float) -> bool:
    sea_bias = 0.28 + moisture * 0.05 - temperature * 0.02
    return elevation < _clamp(sea_bias, 0.18, 0.42)


def _cell_habitability(elevation: float, moisture: float, temperature: float, has_water: bool) -> float:
    water_bonus = 0.06 if has_water else 0.0
    return round(_clamp((moisture * 0.42 + temperature * 0.3 + elevation * 0.12 + water_bonus), 0.0, 1.0), 3)


def _event(step: int, system_id: str, planet_id: str | None, category: str, title: str, detail: str, severity: str = "info") -> dict[str, Any]:
    return {
        "step": step,
        "system_id": system_id,
        "planet_id": planet_id,
        "category": category,
        "title": title,
        "detail": detail,
        "severity": severity,
    }


def _world_influences() -> dict[str, float]:
    return {
        "temperature_drift": 0.0,
        "moisture_drift": 0.0,
        "fertility": 0.0,
        "mutation_pressure": 0.0,
        "environmental_stability": 0.0,
        "resource_richness": 0.0,
        "disaster_pressure": 0.0,
        "protection": 0.0,
        "cooperation_bias": 0.0,
        "conflict_bias": 0.0,
        "curiosity_bias": 0.0,
        "caution_bias": 0.0,
        "invention_bias": 0.0,
        "agriculture_bias": 0.0,
        "navigation_bias": 0.0,
        "astronomy_bias": 0.0,
        "spirituality_bias": 0.0,
        "collapse_suppression": 0.0,
        "expansion_drive_bias": 0.0,
    }


def _culture_seed(seed: int, planet_id: str, index: int, habitability: float) -> dict[str, float]:
    rng = _rng(seed, planet_id, index, "culture")
    baseline = 0.16 + habitability * 0.22
    return {
        "cooperation": round(_clamp(baseline + rng.uniform(-0.05, 0.08), 0.0, 1.0), 3),
        "conflict": round(_clamp(0.14 + rng.uniform(-0.03, 0.06), 0.0, 1.0), 3),
        "curiosity": round(_clamp(baseline + rng.uniform(-0.04, 0.09), 0.0, 1.0), 3),
        "caution": round(_clamp(0.18 + rng.uniform(-0.02, 0.08), 0.0, 1.0), 3),
        "invention": round(_clamp(0.08 + habitability * 0.1 + rng.uniform(-0.02, 0.05), 0.0, 1.0), 3),
        "agriculture": round(_clamp(0.1 + habitability * 0.12 + rng.uniform(-0.03, 0.05), 0.0, 1.0), 3),
        "navigation": round(_clamp(0.08 + rng.uniform(-0.02, 0.05), 0.0, 1.0), 3),
        "astronomy": round(_clamp(0.06 + rng.uniform(-0.02, 0.05), 0.0, 1.0), 3),
        "spirituality": round(_clamp(0.12 + rng.uniform(-0.02, 0.08), 0.0, 1.0), 3),
        "expansion_drive": round(_clamp(0.08 + rng.uniform(-0.02, 0.05), 0.0, 1.0), 3),
    }


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
            has_water = _has_water(elevation, moisture, temperature)
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
                    "volcanic": round(volcanic, 3),
                    "has_water": has_water,
                    "habitability": _cell_habitability(elevation, moisture, temperature, has_water),
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


def _stage_for_species(population: int, tech_tier: float, coordination: float, orbital: bool) -> str:
    if orbital:
        return "spacefaring"
    if population >= 220 and tech_tier >= 0.55 and coordination >= 0.48:
        return "civilization"
    if population >= 140 and tech_tier >= 0.34:
        return "toolmakers"
    if population > 0:
        return "biosphere"
    return "extinct"


def _spawn_species(seed: int, planet_id: str, metrics: dict[str, float]) -> list[dict[str, Any]]:
    species_rng = _rng(seed, planet_id, "species")
    capacity = 0
    if metrics["habitability"] > 0.5:
        capacity += 1
    if metrics["water_ratio"] > 0.3 and metrics["avg_temperature"] > 0.3:
        capacity += 1
    if metrics["avg_moisture"] > 0.42:
        capacity += 1
    capacity = max(0, min(capacity, 3))
    species: list[dict[str, Any]] = []
    for index in range(capacity):
        template = SPECIES_TEMPLATES[(species_rng.randint(0, 999) + index) % len(SPECIES_TEMPLATES)]
        base_population = int(60 + metrics["habitability"] * 140 + species_rng.randint(0, 65))
        culture = _culture_seed(seed, planet_id, index, metrics["habitability"])
        tech_tier = round(sum(culture[key] for key in ["invention", "agriculture", "navigation", "astronomy"]) / 4, 3)
        coordination = round(sum(culture[key] for key in ["cooperation", "caution", "agriculture"]) / 3, 3)
        species.append(
            {
                "id": f"{planet_id}-species-{index}",
                "name": template.name,
                "adaptation": template.adaptation,
                "stage": _stage_for_species(base_population, tech_tier, coordination, orbital=False),
                "population": base_population,
                "growth_bias": template.growth_bias,
                "resilience": round(_clamp(0.45 + metrics["habitability"] * 0.4 + species_rng.random() * 0.2, 0.0, 1.0), 3),
                "culture": culture,
                "tech_tier": tech_tier,
                "coordination": coordination,
                "resourcefulness": round(_clamp((culture["agriculture"] + tech_tier + metrics["habitability"]) / 3, 0.0, 1.0), 3),
                "collapse_pressure": round(_clamp(0.18 + species_rng.random() * 0.08, 0.0, 1.0), 3),
            }
        )
    return species


def _civilization_summary(planet: dict[str, Any], species: dict[str, Any], system: dict[str, Any] | None) -> dict[str, Any] | None:
    stage = species.get("stage", "biosphere")
    if stage not in {"civilization", "spacefaring"}:
        return None

    culture = species["culture"]
    thresholds = {
        "population_scale": round(_clamp(species["population"] / 600, 0.0, 1.0), 3),
        "technological_maturity": round(_clamp((species["tech_tier"] + culture["invention"] + culture["astronomy"] + culture["navigation"]) / 4, 0.0, 1.0), 3),
        "social_coordination": round(species["coordination"], 3),
        "resource_capability": round(_clamp((species["resourcefulness"] + planet["influences"]["resource_richness"] + 0.5) / 1.5, 0.0, 1.0), 3),
        "exploration_drive": round(_clamp((culture["expansion_drive"] + culture["navigation"] + culture["astronomy"] + culture["curiosity"]) / 4, 0.0, 1.0), 3),
        "survival_logistics": round(_clamp((species["resilience"] + planet["influences"]["protection"] + planet["influences"]["environmental_stability"] + culture["caution"] + 1) / 4, 0.0, 1.0), 3),
    }
    expansion_ready = (
        thresholds["population_scale"] >= 0.45
        and thresholds["technological_maturity"] >= 0.53
        and thresholds["social_coordination"] >= 0.5
        and thresholds["resource_capability"] >= 0.52
        and thresholds["exploration_drive"] >= 0.52
        and thresholds["survival_logistics"] >= 0.5
        and species["collapse_pressure"] < 0.5
    )
    orbital_presence = stage == "spacefaring" or (expansion_ready and thresholds["technological_maturity"] >= 0.63)
    known_targets: list[dict[str, Any]] = []
    if system is not None:
        for candidate in system["planets"]:
            if candidate["id"] == planet["id"]:
                continue
            known_targets.append(
                {
                    "planet_id": candidate["id"],
                    "planet_name": candidate["name"],
                    "habitability": candidate["metrics"]["habitability"],
                    "supports_colony": candidate["metrics"]["habitability"] >= 0.54,
                    "supports_outpost": candidate["metrics"]["habitability"] >= 0.36,
                    "occupied": candidate.get("settlement") is not None,
                }
            )

    settlements = 0
    outposts = 0
    if system is not None:
        for candidate in system["planets"]:
            settlement = candidate.get("settlement")
            if not settlement or settlement.get("origin_planet_id") != planet["id"]:
                continue
            if settlement["kind"] == "colony":
                settlements += 1
            else:
                outposts += 1

    return {
        "name": f"{species['name']} Accord",
        "tier": "orbital" if orbital_presence else "planetary",
        "population": species["population"],
        "tech": species["tech_tier"],
        "coordination": species["coordination"],
        "resources": species["resourcefulness"],
        "exploration": thresholds["exploration_drive"],
        "survival": thresholds["survival_logistics"],
        "collapse_risk": species["collapse_pressure"],
        "expansion_ready": expansion_ready,
        "orbital_presence": orbital_presence,
        "settlements": settlements,
        "outposts": outposts,
        "thresholds": thresholds,
        "known_targets": known_targets[:5],
    }


def _life_overview(system: dict[str, Any] | None, planet: dict[str, Any], species_list: list[dict[str, Any]]) -> dict[str, Any]:
    if not species_list and not planet.get("settlement"):
        return {
            "present": False,
            "species_count": 0,
            "dominant_species": None,
            "civilization": None,
            "biosphere_score": 0.0,
            "alert_level": "stable",
            "development_index": 0.0,
            "expansion_targets": [],
            "offworld_presence": [],
        }

    dominant = max(species_list, key=lambda item: item["population"]) if species_list else None
    civilization = _civilization_summary(planet, dominant, system) if dominant else None
    biosphere_score = round(sum(item["population"] for item in species_list) / max(1, len(species_list)) / 240, 3) if species_list else 0.0
    development_index = round(
        max(
            [
                0.0,
                *((item["tech_tier"] + item["coordination"] + item["resourcefulness"]) / 3 for item in species_list),
            ]
        ),
        3,
    )
    alert_level = "stable"
    if civilization and civilization["collapse_risk"] > 0.58:
        alert_level = "critical"
    elif civilization and civilization["expansion_ready"]:
        alert_level = "opportunity"
    elif dominant and dominant["stage"] in {"toolmakers", "civilization", "spacefaring"}:
        alert_level = "watch"

    offworld_presence: list[dict[str, Any]] = []
    if system is not None:
        for candidate in system["planets"]:
            settlement = candidate.get("settlement")
            if settlement and settlement.get("origin_planet_id") == planet["id"]:
                offworld_presence.append(
                    {
                        "target_planet_id": candidate["id"],
                        "target_planet_name": candidate["name"],
                        "kind": settlement["kind"],
                        "population": settlement["population"],
                        "status": settlement["status"],
                    }
                )

    return {
        "present": bool(species_list) or planet.get("settlement") is not None,
        "species_count": len(species_list),
        "dominant_species": dominant["name"] if dominant else None,
        "civilization": civilization,
        "biosphere_score": biosphere_score,
        "alert_level": alert_level,
        "development_index": development_index,
        "expansion_targets": civilization["known_targets"] if civilization else [],
        "offworld_presence": offworld_presence,
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
        "life": {},
        "season_phase": 0.0,
        "anomaly": ["aurora belts", "ring storms", "crystal tides", "deep vents"][radius_rng.randint(0, 3)],
        "influences": _world_influences(),
        "development": {
            "interest": round(metrics["habitability"] * 0.8 + len(species) * 0.08, 3),
            "collapse_risk": 0.18,
            "expansion_ready": False,
            "next_milestone": "biosphere",
        },
        "settlement": None,
        "recent_events": [],
    }


def _system_summary(seed: int, system_index: int) -> dict[str, Any]:
    system_rng = _rng(seed, system_index)
    planets = [_planet_summary(seed, system_index, planet_index) for planet_index in range(system_rng.randint(3, 5))]
    system = {
        "id": f"system-{system_index}",
        "name": f"Helios Node {system_index + 1}",
        "x": round(system_rng.uniform(8, 92), 2),
        "y": round(system_rng.uniform(10, 88), 2),
        "star_type": system_rng.choice(["G", "K", "M", "F"]),
        "luminosity": round(system_rng.uniform(0.4, 1.8), 2),
        "planets": planets,
    }
    for planet in planets:
        planet["life"] = _life_overview(system, planet, planet["species"])
        planet["development"] = _planet_development(planet)
    return system


def _planet_development(planet: dict[str, Any]) -> dict[str, Any]:
    civilization = planet["life"].get("civilization")
    collapse_risk = round(
        civilization["collapse_risk"] if civilization else _clamp(0.18 + planet["influences"]["disaster_pressure"] * 0.6 - planet["influences"]["protection"] * 0.4, 0.0, 1.0),
        3,
    )
    if civilization and civilization["orbital_presence"]:
        milestone = "orbital"
    elif civilization and civilization["expansion_ready"]:
        milestone = "offworld threshold"
    elif planet["life"]["present"] and planet["life"]["development_index"] >= 0.45:
        milestone = "culture threshold"
    elif planet["life"]["present"]:
        milestone = "biosphere growth"
    else:
        milestone = "biosphere seeding"
    return {
        "interest": round(
            _clamp(
                planet["metrics"]["habitability"] * 0.5
                + planet["life"]["development_index"] * 0.35
                + (0.12 if civilization and civilization["expansion_ready"] else 0.0)
                + (0.08 if planet.get("settlement") else 0.0),
                0.0,
                1.0,
            ),
            3,
        ),
        "collapse_risk": collapse_risk,
        "expansion_ready": bool(civilization and civilization["expansion_ready"]),
        "next_milestone": milestone,
    }


def _recompute_planet(system: dict[str, Any], planet: dict[str, Any]) -> None:
    planet["life"] = _life_overview(system, planet, planet["species"])
    planet["development"] = _planet_development(planet)


def _trim_alerts(state: dict[str, Any]) -> None:
    state["alerts"] = state.get("alerts", [])[-MAX_ALERTS:]


def _append_alert(state: dict[str, Any], alert: dict[str, Any]) -> None:
    state.setdefault("alerts", []).append(alert)
    _trim_alerts(state)


def _refresh_simulation_metrics(state: dict[str, Any]) -> None:
    watch_targets = [
        {
            "system_id": system["id"],
            "system_name": system["name"],
            "planet_id": planet["id"],
            "planet_name": planet["name"],
            "interest": planet["development"]["interest"],
            "alert_level": planet["life"]["alert_level"],
            "expansion_ready": planet["development"]["expansion_ready"],
        }
        for system in state["systems"]
        for planet in system["planets"]
        if _is_watch_target(planet)
    ]
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
        "civilization_worlds": sum(
            1
            for system in state["systems"]
            for planet in system["planets"]
            if planet["life"].get("civilization")
        ),
        "settled_worlds": sum(1 for system in state["systems"] for planet in system["planets"] if planet.get("settlement")),
        "watch_worlds": len(watch_targets),
    }
    state["overseer"] = {
        "presence_mode": "steward",
        "watch_worlds": sorted(watch_targets, key=lambda item: item["interest"], reverse=True)[:8],
    }


def _is_watch_target(planet: dict[str, Any]) -> bool:
    return planet["development"]["interest"] > 0.55 or planet["life"]["alert_level"] in {"watch", "opportunity", "critical"}


def _apply_surface_feedback(planet: dict[str, Any], temperature_delta: float, moisture_delta: float) -> None:
    fertility = planet["influences"]["fertility"]
    protection = planet["influences"]["protection"]
    disaster = planet["influences"]["disaster_pressure"]
    for row in planet["surface"]:
        for cell in row:
            volcanic = cell.get("volcanic", 0.0)
            cell["temperature"] = round(_clamp(cell["temperature"] + temperature_delta - disaster * 0.01, 0.0, 1.0), 3)
            cell["moisture"] = round(_clamp(cell["moisture"] + moisture_delta + fertility * 0.02 - disaster * 0.004, 0.0, 1.0), 3)
            cell["has_water"] = _has_water(cell["elevation"], cell["moisture"], cell["temperature"])
            cell["habitability"] = _cell_habitability(cell["elevation"], cell["moisture"], cell["temperature"], cell["has_water"])
            cell["biome"] = _choose_biome(cell["elevation"], cell["moisture"], cell["temperature"], volcanic)
            cell["label"] = BIOME_PALETTE[cell["biome"]]


def _update_species(seed: int, state: dict[str, Any], system: dict[str, Any], planet: dict[str, Any], species: dict[str, Any]) -> None:
    influences = planet["influences"]
    metrics = planet["metrics"]
    culture = species["culture"]
    climate_stress = max(0.0, 0.55 - metrics["habitability"])
    fertility_force = influences["fertility"]
    stability_force = influences["environmental_stability"] + influences["protection"]
    disaster_force = influences["disaster_pressure"]

    culture["cooperation"] = round(_clamp(culture["cooperation"] + 0.018 * (stability_force + influences["cooperation_bias"] + 0.2 - culture["conflict"]), 0.0, 1.0), 3)
    culture["conflict"] = round(_clamp(culture["conflict"] + 0.018 * (disaster_force + influences["conflict_bias"] - influences["cooperation_bias"] * 0.5), 0.0, 1.0), 3)
    culture["curiosity"] = round(_clamp(culture["curiosity"] + 0.02 * (metrics["habitability"] + influences["curiosity_bias"] + 0.15), 0.0, 1.0), 3)
    culture["caution"] = round(_clamp(culture["caution"] + 0.018 * (climate_stress + influences["caution_bias"] + 0.12), 0.0, 1.0), 3)
    culture["invention"] = round(_clamp(culture["invention"] + 0.018 * (culture["curiosity"] + influences["invention_bias"] + planet["influences"]["resource_richness"] + 0.18), 0.0, 1.0), 3)
    culture["agriculture"] = round(_clamp(culture["agriculture"] + 0.018 * (metrics["avg_moisture"] + fertility_force + influences["agriculture_bias"] + 0.18), 0.0, 1.0), 3)
    culture["navigation"] = round(_clamp(culture["navigation"] + 0.018 * (metrics["water_ratio"] + culture["curiosity"] * 0.4 + influences["navigation_bias"]), 0.0, 1.0), 3)
    culture["astronomy"] = round(_clamp(culture["astronomy"] + 0.018 * (0.4 + culture["curiosity"] * 0.5 + influences["astronomy_bias"]), 0.0, 1.0), 3)
    culture["spirituality"] = round(_clamp(culture["spirituality"] + 0.015 * (disaster_force + influences["spirituality_bias"] + 0.18), 0.0, 1.0), 3)
    culture["expansion_drive"] = round(_clamp(culture["expansion_drive"] + 0.018 * (culture["navigation"] + culture["astronomy"] + influences["expansion_drive_bias"] + 0.08), 0.0, 1.0), 3)

    species["tech_tier"] = round(_clamp((culture["invention"] + culture["agriculture"] + culture["navigation"] + culture["astronomy"]) / 4, 0.0, 1.0), 3)
    species["coordination"] = round(_clamp((culture["cooperation"] + culture["caution"] + culture["agriculture"] + influences["environmental_stability"] + 0.6) / 4.6, 0.0, 1.0), 3)
    species["resourcefulness"] = round(_clamp((culture["agriculture"] + species["tech_tier"] + influences["resource_richness"] + metrics["habitability"] + 1) / 4, 0.0, 1.0), 3)
    species["collapse_pressure"] = round(
        _clamp(
            0.12
            + disaster_force * 0.55
            + culture["conflict"] * 0.35
            + climate_stress * 0.4
            - influences["collapse_suppression"] * 0.55
            - influences["protection"] * 0.4
            - species["coordination"] * 0.28,
            0.0,
            1.0,
        ),
        3,
    )
    species["resilience"] = round(_clamp(species["resilience"] + influences["mutation_pressure"] * 0.02 + influences["protection"] * 0.015 - disaster_force * 0.01, 0.0, 1.0), 3)

    growth_rate = (
        (metrics["habitability"] - 0.42) * 0.28
        + fertility_force * 0.12
        + species["resourcefulness"] * 0.08
        + species["tech_tier"] * 0.05
        - species["collapse_pressure"] * 0.16
    )
    next_population = int(max(0, species["population"] * (1 + growth_rate) + 6))
    species["population"] = next_population

    orbital_presence = False
    if next_population >= 260 and species["tech_tier"] >= 0.6 and species["coordination"] >= 0.5 and species["collapse_pressure"] < 0.5:
        orbital_presence = True

    previous_stage = species["stage"]
    species["stage"] = _stage_for_species(next_population, species["tech_tier"], species["coordination"], orbital_presence)
    if previous_stage != species["stage"] and species["stage"] in {"toolmakers", "civilization", "spacefaring"}:
        _append_alert(
            state,
            _event(
                state["current_step"],
                system["id"],
                planet["id"],
                "development",
                f"{planet['name']} advanced to {species['stage']}",
                f"{species['name']} on {planet['name']} reached the {species['stage']} stage.",
                "watch",
            ),
        )
        planet["recent_events"].append(f"Epoch {state['current_step']}: {species['name']} advanced to {species['stage']}.")


def _update_settlement(state: dict[str, Any], system: dict[str, Any], planet: dict[str, Any]) -> None:
    settlement = planet.get("settlement")
    if not settlement:
        return
    viability = _clamp(
        planet["metrics"]["habitability"] * 0.65
        + planet["influences"]["resource_richness"] * 0.15
        + settlement.get("support", 0.45) * 0.2,
        0.0,
        1.0,
    )
    growth = 0.08 if settlement["kind"] == "colony" else 0.03
    settlement["population"] = int(max(0, settlement["population"] * (1 + viability * growth - 0.03)))
    settlement["viability"] = round(viability, 3)
    settlement["status"] = "struggling" if viability < 0.38 else "active"
    if settlement["population"] <= 0:
        _append_alert(
            state,
            _event(
                state["current_step"],
                system["id"],
                planet["id"],
                "collapse",
                f"{planet['name']} lost its {settlement['kind']}",
                f"The offworld {settlement['kind']} on {planet['name']} could not survive local conditions.",
                "critical",
            ),
        )
        planet["recent_events"].append(f"Epoch {state['current_step']}: offworld presence collapsed.")
        planet["settlement"] = None


def _attempt_expansion(state: dict[str, Any], system: dict[str, Any], source_planet: dict[str, Any]) -> None:
    civilization = source_planet["life"].get("civilization")
    if not civilization or not civilization["expansion_ready"] or not civilization["orbital_presence"]:
        return

    source_species = max(source_planet["species"], key=lambda item: item["population"], default=None)
    if source_species is None or source_species["population"] < 260:
        return
    candidates = []
    for candidate in system["planets"]:
        if candidate["id"] == source_planet["id"] or candidate.get("settlement") is not None:
            continue
        habitability = candidate["metrics"]["habitability"]
        score = round(habitability * 0.55 + candidate["metrics"]["water_ratio"] * 0.15 + candidate["influences"]["resource_richness"] * 0.15 + civilization["resources"] * 0.15, 3)
        candidates.append((score, candidate))
    if not candidates:
        return

    candidates.sort(key=lambda item: item[0], reverse=True)
    _, target = candidates[0]
    kind = None
    if target["metrics"]["habitability"] >= 0.52 and civilization["exploration"] >= 0.54:
        kind = "colony"
    elif target["metrics"]["habitability"] >= 0.34 and civilization["survival"] >= 0.54 and civilization["resources"] >= 0.5:
        kind = "outpost"
    if kind is None:
        return

    settlers = int(source_species["population"] * (0.08 if kind == "colony" else 0.03))
    if settlers < 12:
        return
    source_species["population"] -= settlers
    target["settlement"] = {
        "kind": kind,
        "origin_planet_id": source_planet["id"],
        "origin_planet_name": source_planet["name"],
        "civilization_name": civilization["name"],
        "population": settlers,
        "established_step": state["current_step"],
        "status": "active",
        "support": round(civilization["survival"], 3),
        "viability": round(_clamp(target["metrics"]["habitability"] * 0.7 + civilization["survival"] * 0.3, 0.0, 1.0), 3),
    }
    target["recent_events"].append(
        f"Epoch {state['current_step']}: {civilization['name']} founded a {kind} from {source_planet['name']}."
    )
    _append_alert(
        state,
        _event(
            state["current_step"],
            system["id"],
            target["id"],
            "expansion",
            f"{kind.title()} founded on {target['name']}",
            f"{civilization['name']} launched from {source_planet['name']} and established a {kind} on {target['name']}.",
            "opportunity",
        ),
    )


def _step_planet(seed: int, state: dict[str, Any], system: dict[str, Any], planet: dict[str, Any]) -> None:
    phase = (planet["season_phase"] + 0.18) % (math.pi * 2)
    influences = planet["influences"]
    climate_delta = math.sin(state["current_step"] * 0.4 + planet["orbit_index"] * 0.8) * 0.025
    moisture_delta = math.cos(state["current_step"] * 0.33 + len(planet["species"])) * 0.02
    metrics = planet["metrics"]

    climate_delta += influences["temperature_drift"] * 0.045 - influences["disaster_pressure"] * 0.01 + influences["environmental_stability"] * 0.004
    moisture_delta += influences["moisture_drift"] * 0.045 + influences["fertility"] * 0.01 - influences["disaster_pressure"] * 0.008
    planet["season_phase"] = round(phase, 3)
    _apply_surface_feedback(planet, climate_delta, moisture_delta)
    planet["metrics"] = _aggregate_metrics(planet["surface"])
    metrics = planet["metrics"]

    for species in planet["species"]:
        _update_species(seed, state, system, planet, species)
    planet["species"] = [species for species in planet["species"] if species["population"] > 0]

    if not planet["species"] and metrics["habitability"] > 0.63 and influences["fertility"] > 0.08:
        newcomer = _spawn_species(seed + state["current_step"], planet["id"], metrics)
        planet["species"] = newcomer[:1]
        if planet["species"]:
            _append_alert(
                state,
                _event(
                    state["current_step"],
                    system["id"],
                    planet["id"],
                    "life",
                    f"Life emerged on {planet['name']}",
                    f"A new biosphere appeared on {planet['name']} under sustained fertility pressure.",
                    "opportunity",
                ),
            )
            planet["recent_events"].append(f"Epoch {state['current_step']}: life emerged.")

    _update_settlement(state, system, planet)

    for key, value in list(influences.items()):
        influences[key] = round(value * 0.985, 3)


def normalize_state(state: dict[str, Any]) -> dict[str, Any]:
    state.setdefault("alerts", [])
    state.setdefault("overseer", {"presence_mode": "steward", "watch_worlds": []})
    for system in state.get("systems", []):
        for planet in system.get("planets", []):
            merged = _world_influences()
            merged.update(planet.get("influences", {}))
            planet["influences"] = {key: round(float(value), 3) for key, value in merged.items()}
            planet.setdefault("settlement", None)
            planet.setdefault("recent_events", [])
            for species in planet.get("species", []):
                species.setdefault("culture", _culture_seed(state["seed"], planet["id"], 0, planet["metrics"]["habitability"]))
                species.setdefault("tech_tier", round(sum(species["culture"][key] for key in ["invention", "agriculture", "navigation", "astronomy"]) / 4, 3))
                species.setdefault("coordination", round(sum(species["culture"][key] for key in ["cooperation", "caution", "agriculture"]) / 3, 3))
                species.setdefault("resourcefulness", round(_clamp((species["tech_tier"] + planet["metrics"]["habitability"] + species["culture"]["agriculture"]) / 3, 0.0, 1.0), 3))
                species.setdefault("collapse_pressure", 0.18)
            _recompute_planet(system, planet)
    _refresh_simulation_metrics(state)
    _trim_alerts(state)
    return state


def generate_simulation(seed: int, name: str | None = None) -> dict[str, Any]:
    universe_rng = _rng(seed, "universe")
    systems = [_system_summary(seed, index) for index in range(universe_rng.randint(3, 5))]
    simulation_id = f"sim-{seed}-{uuid.uuid4().hex[:10]}"
    state = {
        "id": simulation_id,
        "name": name or f"Grand Simulation {seed}",
        "seed": seed,
        "current_step": 0,
        "systems": systems,
        "metrics": {},
        "alerts": [],
        "overseer": {"presence_mode": "steward", "watch_worlds": []},
    }
    _refresh_simulation_metrics(state)
    for system in state["systems"]:
        for planet in system["planets"]:
            if planet["life"]["present"]:
                _append_alert(
                    state,
                    _event(
                        0,
                        system["id"],
                        planet["id"],
                        "life",
                        f"{planet['name']} hosts life",
                        f"{planet['name']} begins with a measurable biosphere and is worth monitoring.",
                        "watch",
                    ),
                )
    return state


def apply_influence(state: dict[str, Any], planet_id: str, action: str) -> dict[str, Any]:
    normalize_state(state)
    effect = WORLD_INFLUENCE_EFFECTS.get(action) or CULTURE_INFLUENCE_EFFECTS.get(action)
    if effect is None:
        raise ValueError(f"Unknown influence action: {action}")

    for system in state["systems"]:
        for planet in system["planets"]:
            if planet["id"] != planet_id:
                continue
            if action in CULTURE_INFLUENCE_EFFECTS and not planet["species"]:
                raise ValueError("Culture influences require native species or civilization context on the selected world")
            for key, delta in effect.items():
                planet["influences"][key] = round(_clamp(planet["influences"][key] + delta, -0.5, 1.0), 3)
            if action == "biosphere_seeding" and not planet["species"] and planet["metrics"]["habitability"] >= 0.42:
                planet["species"] = _spawn_species(state["seed"] + state["current_step"] + 7, planet["id"], planet["metrics"])[:1]
            _recompute_planet(system, planet)
            mode = "direct" if action in DIRECT_ACTIONS else "subtle"
            planet["recent_events"].append(f"Epoch {state['current_step']}: overseer used {action.replace('_', ' ')} ({mode}).")
            _append_alert(
                state,
                _event(
                    state["current_step"],
                    system["id"],
                    planet["id"],
                    "intervention",
                    f"Overseer used {action.replace('_', ' ')}",
                    f"{planet['name']} received a {mode} intervention: {action.replace('_', ' ')}.",
                    "watch" if mode == "subtle" else "opportunity",
                ),
            )
            _refresh_simulation_metrics(state)
            return state
    raise ValueError(f"Planet not found: {planet_id}")


def step_simulation(state: dict[str, Any], steps: int = 1) -> dict[str, Any]:
    normalize_state(state)
    if steps < 1:
        return state
    for _ in range(steps):
        state["current_step"] += 1
        for system in state["systems"]:
            for planet in system["planets"]:
                _step_planet(state["seed"], state, system, planet)
            for planet in system["planets"]:
                _recompute_planet(system, planet)
            for planet in system["planets"]:
                _attempt_expansion(state, system, planet)
            for planet in system["planets"]:
                _recompute_planet(system, planet)
        _refresh_simulation_metrics(state)
    return state
