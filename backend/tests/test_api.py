from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient

from app.main import app
from app.storage import DB_PATH, init_db

client = TestClient(app)

WATCH_LEVELS = {"watch", "opportunity", "critical"}


def setup_module() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def best_world(payload: dict) -> dict:
    return max(
        (planet for system in payload["systems"] for planet in system["planets"]),
        key=lambda planet: (planet["metrics"]["habitability"], planet["life"]["development_index"]),
    )


def aggregate_surface(surface: list[list[dict]]) -> dict[str, float]:
    cells = [cell for row in surface for cell in row]
    return {
        "water_ratio": round(sum(1 for cell in cells if cell["has_water"]) / len(cells), 3),
        "avg_temperature": round(sum(cell["temperature"] for cell in cells) / len(cells), 3),
        "avg_moisture": round(sum(cell["moisture"] for cell in cells) / len(cells), 3),
        "habitability": round(sum(cell["habitability"] for cell in cells) / len(cells), 3),
    }


def prepare_expansion_state(seed: int = 3, steps: int = 50) -> tuple[str, dict]:
    create_response = client.post("/api/simulations", json={"seed": seed, "name": "Overseer"})
    assert create_response.status_code == 200
    simulation = create_response.json()
    simulation_id = simulation["id"]
    planet = best_world(simulation)
    actions = [
        "biosphere_seeding",
        "fertility_blessing",
        "stabilize_world",
        "enrich_resources",
        "protect_biosphere",
        "encourage_curiosity",
        "encourage_invention",
        "encourage_agriculture",
        "encourage_navigation",
        "encourage_astronomy",
        "increase_expansion_drive",
        "suppress_collapse",
        "encourage_cooperation",
    ]
    for action in actions * 2:
        response = client.post(f"/api/simulations/{simulation_id}/planets/{planet['id']}/influence", json={"action": action})
        assert response.status_code == 200
        simulation = response.json()
    for _ in range(steps // 25):
        step_response = client.post(f"/api/simulations/{simulation_id}/step", json={"steps": 25})
        assert step_response.status_code == 200
        simulation = step_response.json()
    remaining_steps = steps % 25
    if remaining_steps:
        step_response = client.post(f"/api/simulations/{simulation_id}/step", json={"steps": remaining_steps})
        assert step_response.status_code == 200
        simulation = step_response.json()
    return simulation_id, simulation


def test_create_same_seed_twice_produces_distinct_saved_runs() -> None:
    first = client.post("/api/simulations", json={"seed": 2026, "name": "Baseline A"})
    second = client.post("/api/simulations", json={"seed": 2026, "name": "Baseline B"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] != second.json()["id"]
    assert first.json()["seed"] == second.json()["seed"] == 2026

    list_response = client.get("/api/simulations")
    summaries = list_response.json()
    matching = [item for item in summaries if item["seed"] == 2026]
    assert len(matching) >= 2
    assert len({item["id"] for item in matching}) == len(matching)


def test_step_recomputes_surface_and_metrics_together() -> None:
    create_response = client.post("/api/simulations", json={"seed": 303, "name": "Surface Sync"})
    assert create_response.status_code == 200
    before = create_response.json()
    planet_before = before["systems"][0]["planets"][0]

    step_response = client.post(f"/api/simulations/{before['id']}/step", json={"steps": 5})
    assert step_response.status_code == 200
    after = step_response.json()
    planet_after = after["systems"][0]["planets"][0]

    before_cells = [cell for row in planet_before["surface"] for cell in row]
    after_cells = [cell for row in planet_after["surface"] for cell in row]
    assert any(
        before_cell["temperature"] != after_cell["temperature"]
        or before_cell["moisture"] != after_cell["moisture"]
        or before_cell["habitability"] != after_cell["habitability"]
        or before_cell["has_water"] != after_cell["has_water"]
        or before_cell["biome"] != after_cell["biome"]
        for before_cell, after_cell in zip(before_cells, after_cells)
    )
    assert planet_after["metrics"] == aggregate_surface(planet_after["surface"])


def test_watch_list_contains_only_true_watch_targets() -> None:
    _, payload = prepare_expansion_state()

    watch_worlds = payload["overseer"]["watch_worlds"]
    assert watch_worlds
    for watch in watch_worlds:
        planet = next(
            item
            for system in payload["systems"]
            for item in system["planets"]
            if item["id"] == watch["planet_id"]
        )
        assert planet["development"]["interest"] > 0.55 or planet["life"]["alert_level"] in WATCH_LEVELS


def test_settlement_only_world_rejects_culture_actions() -> None:
    simulation_id, stepped = prepare_expansion_state()
    settlement_world = next(
        item
        for system in stepped["systems"]
        for item in system["planets"]
        if item.get("settlement") is not None and not item["species"]
    )

    response = client.post(
        f"/api/simulations/{simulation_id}/planets/{settlement_world['id']}/influence",
        json={"action": "encourage_curiosity"},
    )
    assert response.status_code == 400
    assert "native species or civilization context" in response.json()["detail"]
