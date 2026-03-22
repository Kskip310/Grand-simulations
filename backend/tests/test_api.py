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


def test_create_and_load_simulation() -> None:
    create_response = client.post("/api/simulations", json={"seed": 2026, "name": "Baseline"})
    assert create_response.status_code == 200
    payload = create_response.json()
    assert payload["id"] == "sim-2026"
    assert payload["metrics"]["system_count"] >= 3
    assert payload["systems"][0]["planets"][0]["surface"][0][0]["biome"]
    assert "life" in payload["systems"][0]["planets"][0]

    fetch_response = client.get(f"/api/simulations/{payload['id']}")
    assert fetch_response.status_code == 200
    assert fetch_response.json()["name"] == "Baseline"


def test_step_updates_world_state_and_lists_simulations() -> None:
    create_response = client.post("/api/simulations", json={"seed": 99, "name": "Stepper"})
    simulation_id = create_response.json()["id"]
    before = create_response.json()["systems"][0]["planets"][0]["metrics"]["habitability"]

    step_response = client.post(f"/api/simulations/{simulation_id}/step", json={"steps": 3})
    assert step_response.status_code == 200
    stepped = step_response.json()
    after = stepped["systems"][0]["planets"][0]["metrics"]["habitability"]

    assert stepped["current_step"] == 3
    assert before != after

    list_response = client.get("/api/simulations")
    assert list_response.status_code == 200
    summaries = list_response.json()
    assert any(item["id"] == simulation_id for item in summaries)
    assert all("metrics" in item for item in summaries)
