"""
SQLite persistence layer — workflows and runs.

Implements the two-table schema from DESIGN-VISION.md Decision 5:

  workflows (id, name, definition JSON, created_at, updated_at)
  runs      (id, workflow_id, status, current_node_id, node_outputs JSON,
             global_state JSON, suspension_context JSON, callback_token,
             created_at, suspended_at, completed_at, error JSON)

Design choices:
  - Raw sqlite3 stdlib — no ORM, per Decision 5.
  - check_same_thread=False: FastAPI runs sync routes in a threadpool, so the
    connection may be used from a thread that didn't create it.
  - JSON columns stored as TEXT; Python dicts serialised to/from JSON at the
    boundary here, so callers always see native Python types.
  - The Database class owns one connection. For the API server, a single instance
    is created at startup and injected via FastAPI's dependency injection.
  - ':memory:' is accepted as db_path for test isolation (one per test, no cleanup).

The execution engine (Phase 6) calls update_run() after every node completes —
this is the checkpoint-per-step pattern described in DESIGN-VISION.md Decision 5.
"""
from __future__ import annotations
import json
import sqlite3
import uuid
from datetime import datetime, timezone


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


_WORKFLOW_COLUMNS = ("id", "name", "definition", "created_at", "updated_at")
_RUN_COLUMNS = (
    "id", "workflow_id", "status", "current_node_id",
    "node_outputs", "global_state", "suspension_context",
    "callback_token", "created_at", "suspended_at", "completed_at", "error",
)
_JSON_WORKFLOW_COLS = {"definition"}
_JSON_RUN_COLS = {"node_outputs", "global_state", "suspension_context", "error"}


def _deserialise_workflow(row: sqlite3.Row) -> dict:
    d = dict(row)
    for col in _JSON_WORKFLOW_COLS:
        if d.get(col) is not None:
            d[col] = json.loads(d[col])
        elif col in d:
            d[col] = {}
    return d


def _deserialise_run(row: sqlite3.Row) -> dict:
    d = dict(row)
    for col in _JSON_RUN_COLS:
        if d.get(col) is not None:
            d[col] = json.loads(d[col])
        elif col in d:
            d[col] = {} if col in ("node_outputs",) else (
                {"messages": [], "variables": {}} if col == "global_state" else None
            )
    return d


class Database:
    """
    Wrapper around a single SQLite connection.

    Instantiated once at app startup with the db path from DATABASE_URL.
    Tests pass ':memory:' to get per-test isolation.
    """

    def __init__(self, db_path: str):
        self._conn = sqlite3.connect(
            db_path,
            check_same_thread=False,  # FastAPI threadpool may call from any thread
        )
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")  # better concurrency
        self._conn.execute("PRAGMA foreign_keys=ON")

    def init_db(self) -> None:
        """Creates the tables if they don't exist. Safe to call on every startup."""
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS workflows (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                definition  TEXT NOT NULL DEFAULT '{}',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS runs (
                id                  TEXT PRIMARY KEY,
                workflow_id         TEXT NOT NULL REFERENCES workflows(id),
                status              TEXT NOT NULL DEFAULT 'created',
                current_node_id     TEXT,
                node_outputs        TEXT NOT NULL DEFAULT '{}',
                global_state        TEXT NOT NULL DEFAULT '{"messages":[],"variables":{}}',
                suspension_context  TEXT,
                callback_token      TEXT,
                created_at          TEXT NOT NULL,
                suspended_at        TEXT,
                completed_at        TEXT,
                error               TEXT
            );
        """)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # ------------------------------------------------------------------
    # Workflows
    # ------------------------------------------------------------------

    def create_workflow(self, name: str, definition: dict) -> dict:
        wf_id = str(uuid.uuid4())
        now = _now_iso()
        self._conn.execute(
            "INSERT INTO workflows (id, name, definition, created_at, updated_at) VALUES (?,?,?,?,?)",
            (wf_id, name, json.dumps(definition), now, now),
        )
        self._conn.commit()
        return self.get_workflow(wf_id)

    def get_workflow(self, workflow_id: str) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM workflows WHERE id = ?", (workflow_id,)
        ).fetchone()
        return _deserialise_workflow(row) if row else None

    def list_workflows(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM workflows ORDER BY created_at DESC"
        ).fetchall()
        return [_deserialise_workflow(r) for r in rows]

    def update_workflow(self, workflow_id: str, *, name: str = None, definition: dict = None) -> dict | None:
        if not self.get_workflow(workflow_id):
            return None
        now = _now_iso()
        if name is not None and definition is not None:
            self._conn.execute(
                "UPDATE workflows SET name=?, definition=?, updated_at=? WHERE id=?",
                (name, json.dumps(definition), now, workflow_id),
            )
        elif name is not None:
            self._conn.execute(
                "UPDATE workflows SET name=?, updated_at=? WHERE id=?",
                (name, now, workflow_id),
            )
        elif definition is not None:
            self._conn.execute(
                "UPDATE workflows SET definition=?, updated_at=? WHERE id=?",
                (json.dumps(definition), now, workflow_id),
            )
        self._conn.commit()
        return self.get_workflow(workflow_id)

    def find_workflow_by_webhook_path(self, path: str) -> dict | None:
        """
        Scans all saved workflows for one whose definition contains a webhook
        node with data.path matching the given path string.

        Used by POST /webhook/{path} to resolve which workflow to execute
        when an external system fires a webhook at our server.

        This is a linear scan — fine for dozens of workflows (typical product use).
        If the user has thousands of workflows, add a denormalised index column.
        """
        rows = self._conn.execute("SELECT * FROM workflows").fetchall()
        for row in rows:
            wf = _deserialise_workflow(row)
            nodes = wf.get("definition", {}).get("nodes", [])
            for node in nodes:
                if node.get("type") == "webhook":
                    node_path = node.get("data", {}).get("path", "")
                    # Normalise: strip trailing slashes, compare case-insensitively
                    if node_path.rstrip("/").lower() == path.rstrip("/").lower():
                        return wf
        return None

    # ------------------------------------------------------------------
    # Runs
    # ------------------------------------------------------------------

    def create_run(self, workflow_id: str) -> dict:
        run_id = str(uuid.uuid4())
        now = _now_iso()
        self._conn.execute(
            """INSERT INTO runs
               (id, workflow_id, status, node_outputs, global_state, created_at)
               VALUES (?, ?, 'created', '{}', '{"messages":[],"variables":{}}', ?)""",
            (run_id, workflow_id, now),
        )
        self._conn.commit()
        return self.get_run(run_id)

    def get_run(self, run_id: str) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM runs WHERE id = ?", (run_id,)
        ).fetchone()
        return _deserialise_run(row) if row else None

    def update_run(self, run_id: str, fields: dict) -> dict | None:
        """
        Partially updates a run row. Pass only the fields that changed.
        JSON fields (node_outputs, global_state, suspension_context, error)
        are serialised automatically.

        Called by the execution engine after every node completes — this is the
        checkpoint that makes runs resumable after server restarts.
        """
        if not self.get_run(run_id):
            return None

        json_cols = _JSON_RUN_COLS
        assignments = []
        values = []
        for col, val in fields.items():
            if col in json_cols:
                values.append(json.dumps(val) if val is not None else None)
            else:
                values.append(val)
            assignments.append(f"{col} = ?")

        if not assignments:
            return self.get_run(run_id)

        values.append(run_id)
        self._conn.execute(
            f"UPDATE runs SET {', '.join(assignments)} WHERE id = ?",
            values,
        )
        self._conn.commit()
        return self.get_run(run_id)


if __name__ == "__main__":
    # Smoke block: create tables, insert a workflow, create a run, update it.
    db = Database(":memory:")
    db.init_db()

    wf = db.create_workflow("Smoke Test Flow", {"nodes": [], "edges": []})
    print(f"workflow created: id={wf['id']} name={wf['name']}")

    run = db.create_run(wf["id"])
    print(f"run created: id={run['id']} status={run['status']}")

    updated = db.update_run(run["id"], {
        "status": "running",
        "current_node_id": "llm-1",
        "node_outputs": {"text-1": {"value": "Hello", "dataType": "string"}},
    })
    print(f"run updated: status={updated['status']} node_outputs={updated['node_outputs']}")

    fetched = db.get_run(updated["id"])
    print(f"run fetched: status={fetched['status']} outputs={fetched['node_outputs']}")

    db.close()
    print("smoke test complete ✓")
