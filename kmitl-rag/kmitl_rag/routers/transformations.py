"""Read-only access to the transformation records.

The records are internal since the Transformations page and its editing API
were removed: they drive the automatic document summaries (the insight step of
the source pipeline, defaults chosen by `resolve_transformations` in
`kmitl_rag/routers/sources.py`) and the source page's "generate insight" menu, which
lists them here. Changing a summary prompt is a migration, not an API call.
"""

from typing import List

from fastapi import APIRouter, HTTPException
from loguru import logger

from api.models import TransformationResponse
from siet_core.domain.transformation import Transformation
from siet_core.exceptions import OpenNotebookError

router = APIRouter()


def _transformation_response(transformation: Transformation) -> TransformationResponse:
    return TransformationResponse(
        id=transformation.id or "",
        name=transformation.name,
        title=transformation.title,
        description=transformation.description,
        prompt=transformation.prompt,
        apply_default=transformation.apply_default,
        model_id=transformation.model_id,
        created=str(transformation.created),
        updated=str(transformation.updated),
    )


@router.get("/transformations", response_model=List[TransformationResponse])
async def get_transformations():
    """Get all transformations."""
    try:
        transformations = await Transformation.get_all(order_by="name asc")

        return [
            _transformation_response(transformation)
            for transformation in transformations
        ]
    except HTTPException:
        raise
    except OpenNotebookError:
        raise
    except Exception as e:
        logger.error(f"Error fetching transformations: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching transformations: {str(e)}"
        )


@router.get(
    "/transformations/{transformation_id}", response_model=TransformationResponse
)
async def get_transformation(transformation_id: str):
    """Get a specific transformation by ID."""
    try:
        transformation = await Transformation.get(transformation_id)
        if not transformation:
            raise HTTPException(status_code=404, detail="Transformation not found")

        return _transformation_response(transformation)
    except HTTPException:
        raise
    except OpenNotebookError:
        raise
    except Exception as e:
        logger.error(f"Error fetching transformation {transformation_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching transformation: {str(e)}"
        )
