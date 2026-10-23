"""Which knowledge a roadmap request reads."""

import asyncio
from types import SimpleNamespace

from siet_community.routers import community


def test_no_library_means_no_notebooks_and_survives_an_expansion():
    body = community.StudyRoadmapBody(description="อยากเรียน SQL", scope="none")
    user = SimpleNamespace(id=1, role="student")
    assert asyncio.run(community._roadmap_scope(user, body)) == ([], None, "ไม่ใช้คลังความรู้")

    # expansion rebuilds the request from the settings saved with the roadmap
    session = SimpleNamespace(id="roadmap_session:x", settings={"scope": "none", "web": "auto"})
    assert asyncio.run(community._expansion_scope(user, session)) == ([], None)
