"""Request/response models of the AI quiz and roadmap routes."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# =============================================================================
# AI Feature Modules (Quiz + Roadmap) – bundled add-ons
# =============================================================================


class QuizOptionPayload(BaseModel):
    text: str = Field(..., description="Answer option text")
    is_correct: bool = Field(
        False, description="Whether this option is the correct answer"
    )


class QuizQuestionPayload(BaseModel):
    id: int = Field(..., description="1-based question index")
    question: str = Field(..., description="Question text")
    options: List[QuizOptionPayload] = Field(
        ..., description="Exactly 4 multiple-choice options"
    )
    correct_answer: str = Field(
        ..., description="Correct answer (must match one option exactly)"
    )
    explanation: str = Field(..., description="Rationale for the correct answer")


class QuizGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    question_count: int = Field(5, ge=1, le=20)
    language: str = Field("th", description="BCP-47 language code or short tag")
    notebook_id: Optional[str] = Field(
        None, description="Optional notebook to scope the quiz to"
    )
    model_id: Optional[str] = Field(
        None, description="Optional override model ID (otherwise default chat model)"
    )
    saved_post_ids: List[int] = Field(
        default_factory=list,
        max_length=20,
        description="Optional posts saved by the authenticated user to use as quiz context",
    )
    use_saved_posts: bool = False
    saved_collection_id: Optional[int] = Field(default=None, gt=0)


class QuizSessionResponse(BaseModel):
    id: str
    owner_id: str
    topic: str
    language: str
    question_count: int
    questions: List[Dict[str, Any]]
    notebook_id: Optional[str] = None
    model_id: Optional[str] = None
    prompt_hash: str
    created: str
    updated: str


class QuizSessionSummary(BaseModel):
    id: str
    topic: str
    language: str
    question_count: int
    created: str


class QuizGenerateResponse(BaseModel):
    session: QuizSessionResponse
    cached: bool = Field(False, description="True if the result was served from cache")


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
