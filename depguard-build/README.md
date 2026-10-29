# DepGuard (PackGuard)

AI-powered VS Code extension that detects AI-hallucinated and malicious packages before install.

## Project Structure

```
depguard/
  backend/    Python backend: registry clients, rule engine, SQLite history, FastAPI API
  extension/  TypeScript VS Code extension
  ml/         (planned) dataset collection + model training
```

## Quick Start

### Step 1: Start the Backend

**Option A — Double-click the script:**

Open the `backend/` folder and double-click `start_backend.bat` (Windows).

**Option B — Command line:**

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The backend runs on `http://127.0.0.1:8000`. You should see "Uvicorn running" in the terminal.

### Step 2: Install the Extension

1. Open VS Code.
2. Press `Ctrl+Shift+P` → type "Install from VSIX".
3. Select the `depguard-0.2.0.vsix` file from the `extension/` folder.
4. Reload VS Code when prompted.

### Step 3: Use DepGuard

1. Open any project that has a `package.json` or `requirements.txt`.
2. DepGuard automatically scans dependencies when files are opened or saved.
3. Risky packages get **red** (dangerous) or **yellow** (suspicious) underlines.
4. Hover over an underlined package to see the risk reasons.

### Command Palette Commands

Press `Ctrl+Shift+P` and type "DepGuard" to see all available commands:

| Command | Description |
|---------|-------------|
| **DepGuard: Scan Dependencies** | Scan all dependency files in the workspace |
| **DepGuard: Scan Current File** | Scan the currently open file |
| **DepGuard: Check a Package...** | Check a single package by name |
| **DepGuard: Check Backend Status** | Verify the backend connection |
| **DepGuard: View Scan History** | Open a panel showing past scan results |
| **DepGuard: Show Project Summary** | Show total safe/suspicious/dangerous counts |
| **DepGuard: Start Backend Server** | Start the backend from within VS Code |

## How It Works

1. You open a project with `package.json` or `requirements.txt`.
2. The extension reads the dependency list.
3. It sends package names to the Python backend.
4. The backend checks each package against the npm or PyPI registry.
5. A rule engine analyzes metadata (age, downloads, name similarity, etc.).
6. A risk score (0-100) is calculated.
7. Results appear as editor warnings with detailed reasons.
8. Every scan is saved to a local SQLite database.

## Risk Levels

| Score | Level | Meaning |
|-------|-------|---------|
| 0-29 | Safe | Package looks legitimate |
| 30-59 | Suspicious | Some concerning indicators |
| 60-100 | Dangerous | Strong risk signals detected |

## Risk Rules

- **NOT_FOUND** (90 pts): Package does not exist — may be hallucinated.
- **TYPOSQUAT** (45 pts): Name very similar to a popular package.
- **SIMILAR_NAME** (20 pts): Name resembles a popular package.
- **VERY_NEW** (30 pts): Published less than 7 days ago.
- **NEW** (15 pts): Published less than 30 days ago.
- **LOW_DOWNLOADS** (15 pts): Very few weekly downloads.
- **INSTALL_SCRIPT** (25 pts): Runs code at install time.
- **NO_REPO** (10 pts): No source code repository.
- **NO_README** (5 pts): No documentation.
- **NO_LICENSE** (3 pts): No license declared.
- **SINGLE_VERSION** (8 pts): Only one published version.
- **HIGH_ENTROPY** (8 pts): Name looks randomly generated.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/analyze` | Analyze packages `{"ecosystem":"npm","names":["express"]}` |
| GET | `/history` | Scan history |
| GET | `/summary` | Risk level counts |

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer (for development only)
- VS Code 1.93 or newer

## Troubleshooting

**"DepGuard backend is not running"**
→ Start the backend using the startup script or Command Palette → "DepGuard: Start Backend Server".

**"Cannot reach backend"**
→ Check that the backend terminal shows "Uvicorn running on http://127.0.0.1:8000".
→ Check Settings → depguard.apiUrl matches the backend URL.

**Extension not activating**
→ Make sure the workspace contains `package.json` or `requirements.txt`.
→ Check the Output panel (View → Output → select "DepGuard").

## Current Limitations

- The system uses rule-based analysis, not machine learning (ML component is planned).
- The popular-package comparison list contains ~100 packages (expansion to 5000+ is planned).
- Terminal install warnings depend on VS Code Shell Integration API availability.
- The tool warns about risks but cannot automatically block package installations.
- PyPI download counts are not available through the PyPI JSON API.

## Running Tests

```bash
# Backend tests
cd backend
python -m unittest discover -s tests -v

# Extension parser tests
cd extension
node test/parsers.test.js
```
