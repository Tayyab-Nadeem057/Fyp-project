"""FastAPI wrapper for DepGuard Python Security Engine.
Run: uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import db, registry, service

app = FastAPI(title="DepGuard API", version="0.2.0", description="Python package supply-chain security analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    ecosystem: str = "pypi"
    names: list[str]
    project: str | None = None


@app.get("/health")
def health():
    return {"status": "ok", "ecosystem": "pypi"}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if req.ecosystem.lower() != "pypi":
        raise HTTPException(400, "ecosystem must be 'pypi'. DepGuard supports Python packages only.")
    if not req.names or len(req.names) > 200:
        raise HTTPException(400, "provide 1-200 package names")
    return {"results": service.analyze_many(req.ecosystem, req.names, req.project)}


@app.get("/history")
def history(limit: int = 100):
    return {"scans": db.history(limit)}


@app.get("/summary")
def summary():
    return db.summary()
