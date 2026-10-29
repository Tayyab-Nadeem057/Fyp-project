# DepGuard — Python Supply-Chain Security System

An AI-powered security system and VS Code extension that protects Python developers from installing malicious, hallucinated, or typo-squatted packages from PyPI.

```
depguard/
  backend/    Python: PyPI registry client, rule engine, SQLite history, CLI, FastAPI
  extension/  TypeScript VS Code extension (requirements.txt scanning, terminal interception)
  ml/         Dataset collection, feature extraction, and ML classification model
```

## Run the Backend

```bash
cd backend
pip install -r requirements.txt

# Run unit tests (8 tests)
python -m unittest discover -s tests -v

# Quick CLI check (no FastAPI needed)
python cli.py requests reqeusts totally-fake-pkg-xyz

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
# Endpoints: GET /health, POST /analyze, GET /history, GET /summary
```

## Run the VS Code Extension

```bash
cd extension
npm install
npm run compile
node test/parsers.test.js        # Parser tests
```

1. Open `extension/` in VS Code and press **F5** to start the Extension Development Host.
2. Open any Python project with `requirements.txt`, `Pipfile`, or `pyproject.toml`.
3. DepGuard will automatically scan your dependencies and highlight dangerous packages with clear diagnostic reasons.
4. Use Command Palette -> **"DepGuard: Check a Python Package..."** to quickly inspect any package.
5. In the integrated terminal, `pip install <pkg>` triggers pre-install security analysis.

## Risk Scoring System

- **0 – 29**: `SAFE`
- **30 – 59**: `SUSPICIOUS`
- **60 – 100**: `DANGEROUS`

Every point of risk is explainable with clear audit reasons (see `backend/app/rules.py`).
