"""SQLite scan history (powers the dashboard and reports)."""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone

_DEFAULT_DIR = os.path.join(os.path.expanduser("~"), ".depguard")
os.makedirs(_DEFAULT_DIR, exist_ok=True)
DB_PATH = os.environ.get("DEPGUARD_DB", os.path.join(_DEFAULT_DIR, "depguard.db"))


def _conn(path: str | None = None):
    conn = sqlite3.connect(path or DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scanned_at TEXT NOT NULL,
            ecosystem TEXT NOT NULL,
            name TEXT NOT NULL,
            exists_flag INTEGER NOT NULL,
            score INTEGER NOT NULL,
            risk_level TEXT NOT NULL,
            reasons TEXT NOT NULL,
            project TEXT
        )"""
    )
    return conn


def save_scan(result: dict, project: str | None = None, path: str | None = None) -> int:
    with _conn(path) as c:
        cur = c.execute(
            "INSERT INTO scans (scanned_at, ecosystem, name, exists_flag, score, risk_level, reasons, project)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(), result["ecosystem"], result["name"],
             int(result["exists"]), result["score"], result["risk_level"],
             json.dumps(result["reasons"]), project),
        )
        return cur.lastrowid


def history(limit: int = 100, path: str | None = None) -> list[dict]:
    with _conn(path) as c:
        rows = c.execute("SELECT * FROM scans ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["reasons"] = json.loads(d["reasons"])
        d["exists"] = bool(d.pop("exists_flag"))
        out.append(d)
    return out


def summary(path: str | None = None) -> dict:
    with _conn(path) as c:
        rows = c.execute("SELECT risk_level, COUNT(*) AS n FROM scans GROUP BY risk_level").fetchall()
        total = c.execute("SELECT COUNT(*) FROM scans").fetchone()[0]
    counts = {r["risk_level"]: r["n"] for r in rows}
    return {"total": total, "safe": counts.get("safe", 0),
            "suspicious": counts.get("suspicious", 0), "dangerous": counts.get("dangerous", 0)}
