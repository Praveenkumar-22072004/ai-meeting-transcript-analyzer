from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import meetings
from app.database import Base, engine
from app import models

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Meeting Transcript Analyzer", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings.router, prefix="/api")


@app.get("/health")
def health_check():
    return {"status": "ok"}
