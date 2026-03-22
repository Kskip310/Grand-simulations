from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "simulations.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS simulations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                seed INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                state_json TEXT NOT NULL
            )
            """
        )


def save_simulation(state: dict[str, Any]) -> None:
    payload = json.dumps(state)
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO simulations (id, name, seed, state_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                seed = excluded.seed,
                state_json = excluded.state_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (state["id"], state["name"], state["seed"], payload),
        )


def load_simulation(simulation_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT state_json FROM simulations WHERE id = ?",
            (simulation_id,),
        ).fetchone()
    if row is None:
        return None
    return json.loads(row["state_json"])


def list_simulations() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, name, seed, created_at, updated_at, state_json FROM simulations ORDER BY updated_at DESC, created_at DESC"
        ).fetchall()
    simulations: list[dict[str, Any]] = []
    for row in rows:
        state = json.loads(row["state_json"])
        simulations.append(
            {
                "id": row["id"],
                "name": row["name"],
                "seed": row["seed"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "metrics": state.get("metrics", {}),
                "current_step": state.get("current_step", 0),
            }
        )
    return simulations
