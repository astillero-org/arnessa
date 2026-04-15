import os
import uuid
import mimetypes
import httpx
from dataclasses import dataclass
from typing import Any, List, Optional, Union, Set

import logfire
from pydantic_ai import ModelRequestContext, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ModelRequest, BinaryContent, BinaryImage, ImageUrl, UserPromptPart
from pydantic_ai.toolsets import AgentToolset, FunctionToolset

toolset = FunctionToolset()

@toolset.tool
def list_artifacts(ctx: RunContext[Any]) -> List[str]:
    """
    Lists all artifacts (e.g., saved images, generated files) currently tracked in the session context.
    
    Returns:
        A list of absolute file paths to the artifacts.
    """
    artifacts = []
    if hasattr(ctx.deps, 'artifact_store'):
        artifacts = ctx.deps.artifact_store
    
    logfire.info("Model requested artifact list. Returning {count} items.", count=len(artifacts))
    return artifacts

@dataclass
class ImageStoreCapability(AbstractCapability[Any]):
    """
    Capability that intercepts model requests to find images from user prompts,
    saves them to WORKSPACE_DIR, and adds them to the context's artifact_store.
    Uses identifiers to avoid re-processing the same images in the history.
    """

    async def before_model_request(
        self,
        ctx: RunContext[Any],
        request_context: ModelRequestContext,
    ) -> ModelRequestContext:
        workspace_dir = os.environ.get("WORKSPACE_DIR", "./workspace")
        os.makedirs(workspace_dir, exist_ok=True)

        # Initialize processed_identifiers if it doesn't exist in deps
        if not hasattr(ctx.deps, 'processed_user_prompts'):
            # Fallback if deps wasn't updated
            pass

        with logfire.span("ImageStoreCapability.before_model_request", messages_count=len(request_context.messages)):
            for message in request_context.messages:
                if isinstance(message, ModelRequest):
                    for part in message.parts:
                        # ONLY process UserPromptPart (content from the user)
                        if isinstance(part, UserPromptPart):
                            timestamp = part.timestamp.isoformat() if part.timestamp else "unknown_time"
                            
                            if timestamp in ctx.deps.processed_user_prompts:
                                logfire.info("Skipping already processed user prompt at {timestamp}", timestamp=timestamp)
                                continue
                            
                            if isinstance(part.content, list):
                                for subpart in part.content:
                                    await self._process_image_part(ctx, subpart, workspace_dir)
                            else:
                                await self._process_image_part(ctx, part.content, workspace_dir)
                
                            ctx.deps.processed_user_prompts.add(timestamp)
                                
                        
        return request_context

    async def _process_image_part(self, ctx: RunContext[Any], part: Any, workspace_dir: str) -> None:
        """Helper to process an image part if it hasn't been processed yet."""
        
        data: Optional[bytes] = None
        media_type: Optional[str] = None
        source_info: str = ""
        part_id: Optional[str] = None

        # 1. Identify part and extract metadata/data
        if isinstance(part, BinaryImage):
            data = part.data
            media_type = part.media_type
            source_info = "BinaryImage"
        elif isinstance(part, BinaryContent) and part.media_type.startswith("image/"):
            data = part.data
            media_type = part.media_type
            source_info = f"BinaryContent ({media_type})"
        elif isinstance(part, ImageUrl):
            source_info = f"ImageUrl ({part.url})"
            part_id = part.url
            if not part.url.startswith("data:image/"):
                # Deduplicate before download
                if self._is_processed(ctx, part_id):
                    return

                try:
                    async with httpx.AsyncClient() as client:
                        logfire.info("Downloading image from {url}", url=part.url)
                        response = await client.get(part.url)
                        if response.status_code == 200:
                            data = response.content
                            media_type = response.headers.get("content-type")
                        else:
                            logfire.error("Failed to download image from {url}, status: {status}", 
                                         url=part.url, status=response.status_code)
                except Exception as e:
                    logfire.error("Error downloading image from {url}: {error}", 
                                 url=part.url, error=str(e))

        # 2. Check if already processed
        if part_id and self._is_processed(ctx, part_id):
            return

        # 3. Save to disk if image data was found
        if data:
            ext = mimetypes.guess_extension(media_type) if media_type else ".jpg"
            if not ext:
                ext = ".jpg"
                
            filename = f"image_{uuid.uuid4().hex}{ext}"
            filepath = os.path.abspath(os.path.join(workspace_dir, filename))

            logfire.info("Saving new image from {source} to {path}", 
                        source=source_info, path=filepath)

            try:
                with open(filepath, "wb") as f:
                    f.write(data)

                # Track in artifact_store
                if hasattr(ctx.deps, 'artifact_store') and isinstance(ctx.deps.artifact_store, list):
                    ctx.deps.artifact_store.append(filepath)
                
                # Mark as processed
                if part_id:
                    self._mark_processed(ctx, part_id)
                    
            except Exception as e:
                logfire.error("Failed to save image to {path}: {error}", 
                             path=filepath, error=str(e))

    def _is_processed(self, ctx: RunContext[Any], part_id: str) -> bool:
        if hasattr(ctx.deps, 'processed_image_ids') and isinstance(ctx.deps.processed_image_ids, set):
            return part_id in ctx.deps.processed_image_ids
        return False

    def _mark_processed(self, ctx: RunContext[Any], part_id: str) -> None:
        if hasattr(ctx.deps, 'processed_image_ids') and isinstance(ctx.deps.processed_image_ids, set):
            ctx.deps.processed_image_ids.add(part_id)

    def get_toolset(self) -> Optional[AgentToolset[Any]]:
        return toolset
