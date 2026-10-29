"""Seed list of well-known PyPI packages used for typosquat comparison.

In Step 4 replace them with the top ~5,000 packages (e.g. from
hugovk/top-pypi-packages) saved as data/popular_pypi.txt - load_popular() prefers files.
"""
from __future__ import annotations

import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

_SEED = {
    "pypi": """requests numpy pandas scipy matplotlib flask django fastapi uvicorn pytest
    setuptools pip wheel six urllib3 certifi idna boto3 botocore pyyaml cryptography
    sqlalchemy beautifulsoup4 lxml pillow scikit-learn tensorflow torch keras opencv-python
    selenium jinja2 click attrs packaging httpx aiohttp pydantic psycopg2 redis celery
    gunicorn seaborn plotly tqdm openpyxl xgboost transformers python-dateutil colorama""".split(),
}


def load_popular(ecosystem: str = "pypi") -> list[str]:
    path = os.path.join(DATA_DIR, f"popular_{ecosystem}.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            names = [line.strip().lower() for line in f if line.strip()]
        if names:
            return names
    return list(_SEED.get(ecosystem, _SEED["pypi"]))
