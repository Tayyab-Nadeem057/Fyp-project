"""Framework-independent orchestration: fetch -> score -> store.

Kept free of FastAPI so it can be tested and reused (CLI, ML pipeline)."""
from __future__ import annotations

import time

from . import db, registry, rules

_CACHE: dict[tuple[str, str], tuple[float, dict]] = {}
CACHE_TTL = 3600


def analyze(ecosystem: str = "pypi", name: str = "", project: str | None = None,
            fetcher=None, save: bool = True) -> dict:
    if name == "" and ecosystem != "pypi":
        name = ecosystem
        ecosystem = "pypi"
    ecosystem, name = ecosystem.lower().strip(), name.strip()
    key = (ecosystem, name.lower())
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        result = hit[1]
    else:
        info = (fetcher or registry.fetch_package)(ecosystem, name)
        result = rules.evaluate(info)
        _CACHE[key] = (time.time(), result)
    if save:
        db.save_scan(result, project)
    return result


def analyze_many(ecosystem: str = "pypi", names: list[str] | None = None, project: str | None = None, fetcher=None) -> list[dict]:
    if names is None and isinstance(ecosystem, list):
        names = ecosystem
        ecosystem = "pypi"
    names = names or []
    out = []
    for n in dict.fromkeys(names):  # de-duplicate, keep order
        try:
            out.append(analyze(ecosystem, n, project, fetcher))
        except registry.RegistryError as e:
            out.append({"name": n, "ecosystem": ecosystem, "exists": None, "score": 0,
                        "risk_level": "unknown", "reasons": [{"code": "CHECK_FAILED", "points": 0, "text": str(e)}]})
    return out
