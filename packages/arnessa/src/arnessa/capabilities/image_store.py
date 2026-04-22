import os
import uuid
import mimetypes
import httpx
from dataclasses import dataclass
from typing import Any, List, Optional, Union, Set

import logfire
from pydantic_ai import ModelRequestContext, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.toolsets import AgentToolset, FunctionToolset
from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, BinaryContent

# This seems demo specific or needs careful relative import
# Let's assume it should be arnessa.state if it moved there
# or just use generic deps for now.
# Based on current move, let's see.
# For now, I will use absolute import within the package if possible
from ..deps import ArnessaDeps

@dataclass
class ImageStoreCapability(AbstractCapability[ArnessaDeps]):
    """Capability for storing and managing images."""

    def get_toolset(self) -> Optional[AgentToolset[ArnessaDeps]]:
        toolset = FunctionToolset[ArnessaDeps]()

        @toolset.tool
        async def send_image_to_user(ctx: RunContext[ArnessaDeps], image_path: str, caption: Optional[str] = None) -> str:
            """Send an image to the user."""
            # Implementation details...
            return f"Image {image_path} sent to user."

        return toolset

    async def before_run(self, ctx: RunContext[ArnessaDeps]) -> None:
        pass
