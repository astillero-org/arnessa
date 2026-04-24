import base64
from typing import Any, cast

import pytest
from pydantic_ai import RunContext

from arnessa import ArnessaDeps, get_photo_tools


@pytest.mark.asyncio
async def test_list_artifacts_returns_uploaded_artifacts_from_metadata():
    deps = ArnessaDeps(
        session_id="session-123",
        metadata={
            "artifacts": [
                {"name": "sofa.png", "path": "sofa.png", "mime_type": "image/png"},
                {"name": "chair.jpg", "mime_type": "image/jpeg"},
            ]
        },
    )
    ctx = RunContext(deps=deps, model=None, usage=None)  # type: ignore
    tool = get_photo_tools()[0]

    result = await tool.function(cast(Any, ctx))

    assert result == ["sofa.png", "chair.jpg"]


@pytest.mark.asyncio
async def test_list_artifacts_returns_empty_list_without_uploads():
    deps = ArnessaDeps(session_id="session-123")
    ctx = RunContext(deps=deps, model=None, usage=None)  # type: ignore
    tool = get_photo_tools()[0]

    result = await tool.function(cast(Any, ctx))

    assert result == []


@pytest.mark.asyncio
async def test_generate_furniture_image_writes_real_model_bytes(monkeypatch, tmp_path):
    import google.genai
    from google.genai import types

    class FakeModels:
        def generate_content(self, **kwargs):
            assert kwargs["model"] == "gemini-2.5-flash-image"
            assert kwargs["contents"][0] == "make it a sofa"
            return type("Response", (), {
                "parts": [type("Part", (), {"inline_data": type("InlineData", (), {"data": b"png-bytes"})()})()]
            })()

    class FakeClient:
        def __init__(self):
            self.models = FakeModels()

    monkeypatch.setattr(google.genai, "Client", FakeClient)
    monkeypatch.setattr(types.Part, "from_bytes", staticmethod(lambda **kwargs: {"part": kwargs}))

    deps = ArnessaDeps(
        session_id="session-123",
        metadata={
            "artifacts": [
                {
                    "name": "chair.png",
                    "path": "chair.png",
                    "mime_type": "image/png",
                    "data": f"data:image/png;base64,{base64.b64encode(b'input-bytes').decode('ascii')}",
                }
            ]
        },
    )
    monkeypatch.setenv("WORKSPACE_DIR", str(tmp_path))
    ctx = RunContext(deps=deps, model=None, usage=None)  # type: ignore
    tool = get_photo_tools()[1]

    result = await tool.function(cast(Any, ctx), "chair.png", "make it a sofa", "outputs/sofa.png")

    output_path = tmp_path / "outputs" / "sofa.png"
    assert result == str(output_path)
    assert output_path.read_bytes() == b"png-bytes"
    assert deps.metadata["artifacts"][-1]["path"] == str(output_path)
