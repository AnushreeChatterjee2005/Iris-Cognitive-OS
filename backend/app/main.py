import os
os.environ["USE_TF"] = "0"  # Prevent transformers from trying to load TensorFlow

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import memory_routes, workflow_routes, session_routes

app = FastAPI(title="IRIS Cognitive Engine")

# Add CORS middleware to allow the Electron frontend to fetch graph data
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(memory_routes.router, prefix="/memory", tags=["memory"])
app.include_router(workflow_routes.router, prefix="/workflow", tags=["workflow"])
app.include_router(session_routes.router, prefix="/session", tags=["session"])

@app.get("/")
def read_root():
    return {"status": "IRIS Cognitive Engine is running"}
