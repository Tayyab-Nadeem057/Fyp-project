"""Seed lists of well-known packages used for typosquat comparison.

These are SMALL starter lists. In Step 4 replace them with the top ~5,000
packages per ecosystem (e.g. from hugovk/top-pypi-packages and npm download
rankings) saved as data/popular_<ecosystem>.txt - load_popular() prefers files.
"""
from __future__ import annotations

import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

_SEED = {
    "npm": """react react-dom express lodash axios moment chalk commander debug typescript webpack
    vue next jquery underscore async request bluebird uuid yargs fs-extra mkdirp glob rimraf
    colors body-parser cors dotenv eslint prettier jest mocha babel-core tslib rxjs
    socket.io mongoose mysql redis passport jsonwebtoken bcrypt nodemon cheerio puppeteer
    inquirer minimist semver ws zod vite tailwindcss lodash.merge node-fetch left-pad""".split(),
    "pypi": """requests numpy pandas scipy matplotlib flask django fastapi uvicorn pytest
    setuptools pip wheel six urllib3 certifi idna boto3 botocore pyyaml cryptography
    sqlalchemy beautifulsoup4 lxml pillow scikit-learn tensorflow torch keras opencv-python
    selenium jinja2 click attrs packaging httpx aiohttp pydantic psycopg2 redis celery
    gunicorn seaborn plotly tqdm openpyxl xgboost transformers python-dateutil colorama""".split(),
}


def load_popular(ecosystem: str) -> list[str]:
    path = os.path.join(DATA_DIR, f"popular_{ecosystem}.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            names = [line.strip().lower() for line in f if line.strip()]
        if names:
            return names
    return list(_SEED.get(ecosystem, []))
