import base64
import mimetypes
import os
from pathlib import Path
from typing import Any, List, Optional, cast

from pydantic_ai import RunContext, Tool

from ..deps import ArnessaDeps


def _workspace_root(ctx: RunContext[ArnessaDeps]) -> Path:
    backend = getattr(ctx.deps, "backend", None)
    root_dir = getattr(backend, "root_dir", None)
    return Path(root_dir or os.environ.get("WORKSPACE_DIR", "./workspace")).expanduser().resolve()


def _decode_data_url(value: str) -> tuple[bytes, str]:
    header, encoded = value.split(",", 1) if "," in value else ("", value)
    mime_type = "application/octet-stream"
    if header.startswith("data:"):
        mime_type = header[5:].split(";", 1)[0] or mime_type
    return base64.b64decode(encoded), mime_type


def _safe_workspace_path(root: Path, path: str) -> Path:
    candidate = (root / path).resolve() if not Path(path).is_absolute() else Path(path).resolve()
    if root not in candidate.parents and candidate != root:
        raise ValueError(f"Output path must stay inside workspace: {path}")
    candidate.parent.mkdir(parents=True, exist_ok=True)
    return candidate


def _artifact_bytes(ctx: RunContext[ArnessaDeps], input_path: str) -> tuple[bytes, str] | None:
    artifacts = ctx.deps.metadata.get("artifacts") if isinstance(ctx.deps.metadata, dict) else None
    if isinstance(artifacts, list):
        for artifact in artifacts:
            if not isinstance(artifact, dict):
                continue
            artifact_name = artifact.get("path") or artifact.get("name")
            if input_path and artifact_name != input_path:
                continue
            data = artifact.get("data")
            if isinstance(data, str) and data:
                return _decode_data_url(data)

    path = Path(input_path)
    if not path.is_absolute():
        path = _workspace_root(ctx) / path
    if path.exists():
        return path.read_bytes(), mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return None

def get_photo_tools() -> List[Tool[Any]]:
    """Return tools for photo manipulation."""
    
    async def list_artifacts(ctx: RunContext[ArnessaDeps]) -> List[str]:
        """List all current artifacts (photos)."""
        artifacts = ctx.deps.metadata.get("artifacts") if isinstance(ctx.deps.metadata, dict) else None
        if isinstance(artifacts, list):
            names = [
                str(artifact.get("path") or artifact.get("name"))
                for artifact in artifacts
                if isinstance(artifact, dict) and (artifact.get("path") or artifact.get("name"))
            ]
            if names:
                return names

        state_artifacts = getattr(getattr(ctx.deps, "state", None), "artifact_store", None)
        if isinstance(state_artifacts, list):
            return [str(artifact) for artifact in state_artifacts]

        return []

    async def generate_furniture_image(
        ctx: RunContext[ArnessaDeps],
        input_path: str,
        prompt: str,
        output_path: str,
        caption: Optional[str] = None,
    ) -> str:
        """Generate or draw a furniture image from a reference photo and prompt."""
        from google import genai
        from google.genai import types

        root = _workspace_root(ctx)
        output_file = _safe_workspace_path(root, output_path)
        client = genai.Client()
        input_image = _artifact_bytes(ctx, input_path)

        if input_image is not None:
            image_bytes, mime_type = input_image
            response = client.models.generate_content(
                model=os.environ.get("ARNESSA_IMAGE_MODEL", "gemini-2.5-flash-image"),
                contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type=mime_type)],
            )
            parts = getattr(response, "parts", None) or []
            for part in parts:
                inline_data = getattr(part, "inline_data", None)
                data = getattr(inline_data, "data", None)
                if data:
                    output_file.write_bytes(data)
                    break
            else:
                raise RuntimeError("Image generation completed without returning image bytes.")
        else:
            response = client.models.generate_images(
                model=os.environ.get("ARNESSA_IMAGEN_MODEL", "imagen-4.0-generate-001"),
                prompt=prompt,
            )
            generated = getattr(response, "generated_images", None) or []
            if not generated:
                raise RuntimeError("Image generation completed without returning generated images.")
            image = getattr(generated[0], "image", None)
            image_bytes = getattr(image, "image_bytes", None)
            if not image_bytes:
                raise RuntimeError("Image generation completed without returning image bytes.")
            output_file.write_bytes(image_bytes)

        artifacts = ctx.deps.metadata.setdefault("artifacts", [])
        if isinstance(artifacts, list):
            artifacts.append({"name": output_file.name, "path": str(output_file), "mime_type": mimetypes.guess_type(output_file.name)[0] or "image/png"})

        state_artifacts = getattr(getattr(ctx.deps, "state", None), "artifact_store", None)
        if isinstance(state_artifacts, list):
            state_artifacts.append(str(output_file))

        return str(output_file)

    return [
        Tool(cast(Any, list_artifacts), name="list_artifacts", description="List current artifacts"),
        Tool(
            cast(Any, generate_furniture_image),
            name="generate_furniture_image",
            description="Draw/generate a furniture image after the user approves the request.",
            requires_approval=True,
            metadata={"approval_question": "Allow Arnessa to draw this furniture image?"},
        ),
    ]
