"""Request/response models of the AI roadmap routes."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RoadmapNodePayload(BaseModel):
    id: str
    label: str
    description: str = ""
    category: str = "general"
    order: int = 0


class RoadmapEdgePayload(BaseModel):
    source: str
    target: str


class RoadmapGenerateRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=2000)
    title: Optional[str] = Field(
        None, max_length=200, description="Optional explicit title"
    )
    node_count: int = Field(15, ge=3, le=50)
    language: str = Field("th", description="BCP-47 language code or short tag")
    notebook_id: Optional[str] = None
    model_id: Optional[str] = None


class RoadmapSessionResponse(BaseModel):
    id: str
    owner_id: str
    title: str
    description: str
    language: str
    node_count: int
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    notebook_id: Optional[str] = None
    model_id: Optional[str] = None
    prompt_hash: str
    created: str
    updated: str


class RoadmapSessionSummary(BaseModel):
    id: str
    title: str
    description: str
    language: str
    node_count: int
    created: str


class RoadmapGenerateResponse(BaseModel):
    session: RoadmapSessionResponse
    cached: bool = False
