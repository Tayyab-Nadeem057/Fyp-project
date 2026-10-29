"""Rule-based risk assessment.

Each rule returns (points, reason) or None. Points are summed and capped at 100.
Rules are deliberately explainable: every point of risk comes with a reason.
"""
from __future__ import annotations

import math
from collections import Counter
from datetime import datetime, timezone
from difflib import SequenceMatcher

from .popular import load_popular

SAFE_MAX = 29
SUSPICIOUS_MAX = 59  # 60+ => dangerous


def normalize(name: str) -> str:
    return name.lower().replace("_", "-").replace(".", "-")


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def closest_popular(name: str, ecosystem: str):
    """Return (popular_name, similarity) for the nearest well-known package,
    ignoring exact matches."""
    n = normalize(name)
    best, best_sim = None, 0.0
    for p in load_popular(ecosystem):
        if normalize(p) == n:
            return None, 0.0  # it IS a popular package
        s = similarity(n, normalize(p))
        if s > best_sim:
            best, best_sim = p, s
    return best, best_sim


def name_entropy(name: str) -> float:
    counts = Counter(name)
    total = len(name)
    return -sum(c / total * math.log2(c / total) for c in counts.values()) if total else 0.0


def evaluate(info: dict, now: datetime | None = None) -> dict:
    """info: normalized PackageInfo from registry.py. Returns scored result."""
    now = now or datetime.now(timezone.utc)
    name, eco = info["name"], info["ecosystem"]
    reasons: list[dict] = []
    score = 0

    def add(points: int, code: str, text: str):
        nonlocal score
        score += points
        reasons.append({"code": code, "points": points, "text": text})

    # 1. Package does not exist: the core hallucination signal.
    if not info.get("exists"):
        add(90, "NOT_FOUND",
            f"'{name}' does not exist on {eco}. It may be an AI-hallucinated name that an "
            "attacker could register with malicious code.")
        near, sim = closest_popular(name, eco)
        if near and sim >= 0.8:
            add(10, "DID_YOU_MEAN", f"Did you mean '{near}'?")
        return _finish(info, score, reasons)

    # 2. Typosquatting against popular packages.
    near, sim = closest_popular(name, eco)
    if near and sim >= 0.85:
        add(45, "TYPOSQUAT",
            f"Name is very similar to popular package '{near}' (similarity {sim:.0%}).")
    elif near and sim >= 0.75:
        add(20, "SIMILAR_NAME", f"Name resembles popular package '{near}' ({sim:.0%}).")

    # 3. Age.
    created = info.get("created")
    if created:
        age_days = (now - created).days
        if age_days < 7:
            add(30, "VERY_NEW", f"Package was first published only {age_days} day(s) ago.")
        elif age_days < 30:
            add(15, "NEW", f"Package is only {age_days} days old.")
    else:
        add(5, "NO_DATE", "Could not determine when the package was first published.")

    # 4. Popularity.
    dl = info.get("weekly_downloads")
    if dl is not None:
        if dl < 100:
            add(15, "LOW_DOWNLOADS", f"Very few weekly downloads ({dl}).")
        elif dl < 1000:
            add(5, "FEW_DOWNLOADS", f"Low weekly downloads ({dl}).")

    # 5. Install-time code execution (npm).
    if info.get("install_scripts"):
        scripts = ", ".join(info["install_scripts"])
        add(25, "INSTALL_SCRIPT", f"Runs code automatically at install time ({scripts}).")

    # 6. Missing trust signals.
    if not info.get("has_repository"):
        add(10, "NO_REPO", "No source repository linked.")
    if not info.get("has_readme"):
        add(5, "NO_README", "No README/description content.")
    if not info.get("has_license"):
        add(3, "NO_LICENSE", "No license declared.")
    if info.get("version_count", 0) <= 1:
        add(8, "SINGLE_VERSION", "Only one published version.")

    # 7. Gibberish names.
    if len(name) >= 8 and name_entropy(name) > 3.6:
        add(8, "HIGH_ENTROPY", "Name looks randomly generated.")

    return _finish(info, score, reasons)


def _finish(info: dict, score: int, reasons: list[dict]) -> dict:
    score = max(0, min(100, score))
    if score <= SAFE_MAX:
        level = "safe"
    elif score <= SUSPICIOUS_MAX:
        level = "suspicious"
    else:
        level = "dangerous"
    return {
        "name": info["name"],
        "ecosystem": info["ecosystem"],
        "exists": bool(info.get("exists")),
        "score": score,
        "risk_level": level,
        "reasons": reasons,
    }
