import os
import base64
import time
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.toolsets import AgentToolset, FunctionToolset

from ..deps import ArnessaDeps, ArnessaEvent


def _image_data_for_frontend(ctx: RunContext[ArnessaDeps], image_path: str) -> tuple[str, str, str]:
    if image_path.startswith(("data:", "http://", "https://")):
        return image_path, os.path.basename(image_path.split("?", 1)[0]) or "Generated image", mimetypes.guess_type(image_path)[0] or "image/png"

    path = Path(image_path)
    if not path.is_absolute():
        backend = getattr(ctx.deps, "backend", None)
        root_dir = getattr(backend, "root_dir", None) or os.environ.get("WORKSPACE_DIR", "./workspace")
        path = Path(root_dir) / path

    if not path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{data}", path.name, mime_type

@dataclass
class ImageStoreCapability(AbstractCapability[ArnessaDeps]):
    """Capability for storing and managing images."""

    def get_toolset(self) -> Optional[AgentToolset[ArnessaDeps]]:
        toolset = FunctionToolset[ArnessaDeps]()

        @toolset.tool
        async def send_image_to_user(ctx: RunContext[ArnessaDeps], image_path: str, caption: Optional[str] = None) -> str:
            """Send an image to the user."""
            image_data, image_name, mime_type = _image_data_for_frontend(ctx, image_path)
            await ctx.deps.events.emit(ArnessaEvent(
                kind="image_sent",
                payload={
                    "text": caption or "Generated image",
                    "images": [
                        {
                            "data": image_data,
                            "path": image_path,
                            "name": image_name,
                            "mime_type": mime_type,
                        }
                    ],
                },
                session_id=ctx.deps.session_id,
                timestamp=time.time(),
            ))
            return f"Image {image_path} sent to user."

        return toolset

    async def before_run(self, ctx: RunContext[ArnessaDeps]) -> None:
        pass
