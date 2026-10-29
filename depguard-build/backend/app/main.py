"""FastAPI wrapper. Run:  uvicorn app.main:app --reload --port 8000
(from the backend/ folder, after `pip install -r requirements.txt`)."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import db, registry, service

app = FastAPI(title="DepGuard API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    ecosystem: str  # "npm" | "pypi"
    names: list[str]
    project: str | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if req.ecosystem.lower() not in ("npm", "pypi"):
        raise HTTPException(400, "ecosystem must be 'npm' or 'pypi'")
    if not req.names or len(req.names) > 200:
        raise HTTPException(400, "provide 1-200 package names")
    return {"results": service.analyze_many(req.ecosystem, req.names, req.project)}


@app.get("/history")
def history(limit: int = 100):
    return {"scans": db.history(limit)}


@app.get("/summary")
def summary():
    return db.summary()
