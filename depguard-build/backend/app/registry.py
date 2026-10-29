"""Registry clients for npm and PyPI (standard library only).

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
NPM_URL = "https://registry.npmjs.org/{name}"
NPM_DOWNLOADS_URL = "https://api.npmjs.org/downloads/point/last-week/{name}"
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


def fetch_npm(name: str) -> dict:
    data = _get_json(NPM_URL.format(name=urllib.parse.quote(name, safe="@")))
    if data is None:
        return {"exists": False, "ecosystem": "npm", "name": name}
    times = data.get("time", {})
    versions = data.get("versions", {})
    latest_tag = data.get("dist-tags", {}).get("latest")
    latest = versions.get(latest_tag, {}) if latest_tag else {}
    scripts = latest.get("scripts", {}) or {}
    downloads = None
    try:
        d = _get_json(NPM_DOWNLOADS_URL.format(name=urllib.parse.quote(name, safe="@")))
        downloads = (d or {}).get("downloads")
    except RegistryError:
        pass
    repo = data.get("repository")
    return {
        "exists": True,
        "ecosystem": "npm",
        "name": name,
        "created": _parse_ts(times.get("created")),
        "modified": _parse_ts(times.get("modified")),
        "version_count": len(versions),
        "weekly_downloads": downloads,
        "maintainer_count": len(data.get("maintainers", []) or []),
        "has_repository": bool(repo),
        "has_readme": bool((data.get("readme") or "").strip()) and data.get("readme") != "ERROR: No README data found!",
        "has_license": bool(data.get("license") or latest.get("license")),
        "install_scripts": [k for k in ("preinstall", "install", "postinstall") if k in scripts],
        "description": data.get("description") or "",
    }


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
    return {
        "exists": True,
        "ecosystem": "pypi",
        "name": name,
        "created": min(upload_times) if upload_times else None,
        "modified": max(upload_times) if upload_times else None,
        "version_count": len(releases),
        "weekly_downloads": None,  # PyPI JSON API has no download counts (use pypistats later)
        "maintainer_count": 1 if (info.get("author") or info.get("maintainer")) else 0,
        "has_repository": bool(urls or info.get("home_page")),
        "has_readme": bool((info.get("description") or "").strip()),
        "has_license": bool(info.get("license") or info.get("license_expression")),
        "install_scripts": [],
        "description": info.get("summary") or "",
    }


def fetch_package(ecosystem: str, name: str) -> dict:
    if ecosystem == "npm":
        return fetch_npm(name)
    if ecosystem == "pypi":
        return fetch_pypi(name)
    raise ValueError(f"Unsupported ecosystem: {ecosystem}")
