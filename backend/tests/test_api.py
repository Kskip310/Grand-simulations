from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient

from app.main import app
from app.storage import DB_PATH, init_db

client = TestClient(app)


def setup_module() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def best_world(payload: dict) -> dict:
    return max(
        (planet for system in payload["systems"] for planet in system["planets"]),
        key=lambda planet: (planet["metrics"]["habitability"], planet["life"]["development_index"]),
    )


def test_create_and_load_simulation() -> None:
    create_response = client.post("/api/simulations", json={"seed": 2026, "name": "Baseline"})
    assert create_response.status_code == 200
    payload = create_response.json()
    planet = payload["systems"][0]["planets"][0]

    assert payload["id"] == "sim-2026"
    assert payload["metrics"]["system_count"] >= 3
    assert planet["surface"][0][0]["biome"]
    assert "life" in planet
    assert "influences" in planet
    assert "alerts" in payload
    assert "overseer" in payload

    fetch_response = client.get(f"/api/simulations/{payload['id']}")
    assert fetch_response.status_code == 200
    assert fetch_response.json()["name"] == "Baseline"


def test_influence_and_step_drive_real_overseer_progress() -> None:
    create_response = client.post("/api/simulations", json={"seed": 77, "name": "Overseer"})
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

    before = next(
        item
        for system in simulation["systems"]
        for item in system["planets"]
        if item["id"] == planet["id"]
    )

    step_response = client.post(f"/api/simulations/{simulation_id}/step", json={"steps": 25})
    assert step_response.status_code == 200
    stepped = step_response.json()
    after = next(
        item
        for system in stepped["systems"]
        for item in system["planets"]
        if item["id"] == planet["id"]
    )

    assert stepped["current_step"] == 25
    assert after["metrics"]["habitability"] != before["metrics"]["habitability"]
    assert any(alert["category"] == "intervention" for alert in stepped["alerts"])
    assert after["life"]["present"]
    assert after["life"]["civilization"] is not None
    assert after["life"]["civilization"]["orbital_presence"] or after["life"]["civilization"]["expansion_ready"]

    offworlds = [
        item
        for system in stepped["systems"]
        for item in system["planets"]
        if item.get("settlement") is not None
    ]
    assert after["life"]["civilization"]["known_targets"]
    assert offworlds
