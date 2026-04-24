import base64
from typing import Any, cast

import pytest
from pydantic_ai import RunContext
from pydantic_ai.toolsets import FunctionToolset

from arnessa import ArnessaDeps, ArnessaEvent, ImageStoreCapability


class Sink:
    def __init__(self):
        self.events: list[ArnessaEvent] = []

    async def emit(self, event: ArnessaEvent) -> None:
        self.events.append(event)


@pytest.mark.asyncio
async def test_send_image_to_user_embeds_local_file_as_data_url(tmp_path):
    image_path = tmp_path / "sofa.png"
    image_path.write_bytes(b"png-bytes")
    sink = Sink()
    deps = ArnessaDeps(session_id="session-123", events=sink)
    ctx = RunContext(deps=deps, model=None, usage=None)  # type: ignore
    toolset = cast(FunctionToolset, ImageStoreCapability().get_toolset())
    tools = await cast(Any, toolset).get_tools(ctx)

    result = await cast(Any, toolset).call_tool("send_image_to_user", {"image_path": str(image_path), "caption": "Done"}, ctx, tools["send_image_to_user"])

    assert result == f"Image {image_path} sent to user."
    assert sink.events[0].kind == "image_sent"
    image = sink.events[0].payload["images"][0]
    assert image["data"] == f"data:image/png;base64,{base64.b64encode(b'png-bytes').decode('ascii')}"
    assert image["name"] == "sofa.png"
    assert image["mime_type"] == "image/png"
