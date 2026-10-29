"""Registry client for PyPI (standard library only).

Each fetch_* function returns a normalized PackageInfo dict, or
{"exists": False} when the registry answers 404. Network errors raise
RegistryError so callers can distinguish "does not exist" from "could not check".
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

TIMEOUT = 8
PYPI_URL = "https://pypi.org/pypi/{name}/json"


class RegistryError(Exception):
    pass


def _get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "DepGuard/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise RegistryError(f"HTTP {e.code} for {url}") from e
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        raise RegistryError(f"Could not reach {url}: {e}") from e


def _parse_ts(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def fetch_pypi(name: str) -> dict:
    data = _get_json(PYPI_URL.format(name=urllib.parse.quote(name)))
    if data is None:
        return {"exists": False, "ecosystem": "pypi", "name": name}
    info = data.get("info", {})
    releases = data.get("releases", {})
    upload_times = [
        _parse_ts(f.get("upload_time_iso_8601"))
        for files in releases.values()
        for f in files
    ]
    upload_times = [t for t in upload_times if t]
    urls = info.get("project_urls") or {}

    has_maintainer = bool(
        info.get("author")
        or info.get("maintainer")
        or info.get("author_email")
        or info.get("maintainer_email")
    )

    return {
        "exists": True,
        "ecosystem": "pypi",
        "name": name,
        "created": min(upload_times) if upload_times else None,
        "modified": max(upload_times) if upload_times else None,
        "version_count": len(releases),
        "weekly_downloads": None,  # PyPI JSON API has no download counts (use pypistats later)
        "maintainer_count": 1 if has_maintainer else 0,
        "has_repository": bool(urls or info.get("home_page")),
        "has_readme": bool((info.get("description") or "").strip()),
        "has_license": bool(info.get("license") or info.get("license_expression")),
        "install_scripts": [],
        "description": info.get("summary") or "",
    }


def fetch_package(ecosystem: str = "pypi", name: str = "") -> dict:
    if name == "" and ecosystem != "pypi":
        name = ecosystem
        ecosystem = "pypi"
    if ecosystem.lower() != "pypi":
        raise ValueError(f"Unsupported ecosystem: {ecosystem}. DepGuard supports Python (pypi) packages only.")
    return fetch_pypi(name)
