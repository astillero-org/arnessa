import csv
import io
import mimetypes
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch
from PIL import Image
from pydantic_ai import Tool
from google.genai import types, Client

# Constants
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

def _convert_heic_to_jpg(root_dir: str, quality: int = 95) -> str:
    root = Path(root_dir)
    jpg_dir = root / "jpg"
    jpg_dir.mkdir(parents=True, exist_ok=True)
    
    heic_files = list(root.rglob("*.heic")) + list(root.rglob("*.HEIC"))
    if not heic_files:
        return "No HEIC files found."
        
    converted = 0
    failed = 0
    for heic_file in heic_files:
        rel_path = heic_file.relative_to(root)
        jpg_file = jpg_dir / rel_path.with_suffix(".jpg")
        jpg_file.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            subprocess.run(["convert", str(heic_file), "-quality", str(quality), str(jpg_file)], check=True, capture_output=True)
            converted += 1
        except subprocess.CalledProcessError:
            failed += 1
            
    return f"Conversion complete. Total: {len(heic_files)}, Converted: {converted}, Failed: {failed}. Output: {jpg_dir}"

def _convert_psd_to_jpg(root_dir: str, output_root: str = "output_jpg") -> str:
    root = Path(root_dir)
    out_root = Path(output_root)
    
    psd_files = list(root.rglob("*.psd")) + list(root.rglob("*.PSD"))
    if not psd_files:
        return "No PSD files found."
        
    converted = 0
    for psd in psd_files:
        rel_path = psd.relative_to(root)
        output_path = out_root / rel_path.with_suffix(".jpg")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        cmd = ["magick", f"{psd}[0]", "-background", "white", "-alpha", "remove", "-alpha", "off", str(output_path)]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            converted += 1
        except subprocess.CalledProcessError:
            pass
            
    return f"Done. Converted {converted} PSD file(s) to {output_root}."

def _create_product_collages(jpg_root: str, output_dir: str, target_height: int = 1200) -> str:
    import math
    root = Path(jpg_root)
    collages_dir = Path(output_dir)
    collages_dir.mkdir(parents=True, exist_ok=True)

    products = {}
    for folder in root.iterdir():
        if folder.is_dir():
            images = sorted([f for f in folder.iterdir() if f.suffix.lower() == ".jpg"])
            if images:
                products[folder.name] = images

    if not products:
        return "No product folders with JPG images found."

    results = []
    for product_name, image_paths in products.items():
        try:
            images = []
            for img_path in image_paths:
                img = Image.open(img_path)
                if img.mode in ("RGBA", "LA", "P"):
                    img = img.convert("RGB")
                
                ratio = target_height / img.height
                new_width = int(img.width * ratio)
                img = img.resize((new_width, target_height), Image.Resampling.LANCZOS)
                images.append(img)

            num_images = len(images)
            cols = math.ceil(math.sqrt(num_images))
            rows = math.ceil(num_images / cols)

            total_width = sum(img.width for img in images[:cols])
            total_height = target_height * rows

            collage = Image.new("RGB", (total_width, total_height), "white")

            x_offset = 0
            y_offset = 0
            for idx, img in enumerate(images):
                if idx > 0 and idx % cols == 0:
                    y_offset += target_height
                    x_offset = 0
                collage.paste(img, (x_offset, y_offset))
                x_offset += img.width

            collage.save(collages_dir / f"{product_name}.jpg", quality=95)
            results.append(product_name)
        except Exception as e:
            results.append(f"{product_name} (Error: {e})")

    return f"Processed {len(results)} collages. Saved to {output_dir}."

def _remove_backgrounds(input_dir: str, output_dir: str, match: str = "catalog_front", model: str = "u2net") -> str:
    import importlib
    try:
        rembg = importlib.import_module("rembg")
    except ImportError:
        return "rembg not installed."

    input_path = Path(input_dir)
    output_path = Path(output_dir)
    session = rembg.new_session(model)

    candidates = [p for p in input_path.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS and match.lower() in p.name.lower()]
    if not candidates:
        return "No matching images found."

    processed = 0
    for p in candidates:
        rel = p.relative_to(input_path)
        trans_out = output_path / rel.parent / f"{p.stem}_nobg.png"
        white_out = output_path / rel.parent / f"{p.stem}_whitebg.png"
        
        trans_out.parent.mkdir(parents=True, exist_ok=True)
        
        with open(p, "rb") as f:
            img_data = f.read()
            output_data = rembg.remove(img_data, session=session)
            
        with open(trans_out, "wb") as f:
            f.write(output_data)
            
        with Image.open(io.BytesIO(output_data)) as img:
            rgba = img.convert("RGBA")
            white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            composite = Image.alpha_composite(white, rgba)
            composite.convert("RGB").save(white_out, format="PNG")
            
        processed += 1

    return f"Done. Processed {processed} images. Results in {output_dir}."

def _upscale_images(input_dir: str, output_dir: Optional[str] = None, scale: float = 4.0, backend: str = "local-realesrgan") -> str:
    in_dir = Path(input_dir)
    out_dir = Path(output_dir) if output_dir else Path(f"{input_dir}_upscaled")
    out_dir.mkdir(parents=True, exist_ok=True)

    files = [p for p in in_dir.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS]
    if not files:
        return "No images found to upscale."

    if backend == "local-realesrgan":
        try:
            from realesrgan import RealESRGANer
            from basicsr.archs.rrdbnet_arch import RRDBNet
            import cv2
        except ImportError:
            return "Real-ESRGAN or OpenCV dependencies missing."

        device = torch.device("mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu")
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        upsampler = RealESRGANer(scale=4, model_path="RealESRGAN_x4plus.pth", model=model, tile=400, device=device)
        
        for f in files:
            img = cv2.imread(str(f), cv2.IMREAD_UNCHANGED)
            output, _ = upsampler.enhance(img, outscale=scale)
            cv2.imwrite(str(out_dir / f.name), output)

    else:
        return f"Unknown backend: {backend}"

    return f"Upscaling complete. {len(files)} images processed. Output: {out_dir}"

def _generate_furniture_image(input_image_path: str, shot_prompt: str, destination_path: str, model: str = "gemini-3.1-flash-image-preview") -> str:
    """
    Generates a single furniture image using Google Gemini API.
    
    Args:
        input_image_path: Path to the reference catalog image.
        shot_prompt: The AI prompt to use for generation.
        destination_path: Where to save the generated image.
        model: Gemini model to use.
        
    Returns:
        A success or error message.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return "GOOGLE_API_KEY not set."
    
    client = Client(api_key=api_key)
    
    if os.path.exists(destination_path):
        return f"File already exists: {destination_path}"
            
    try:
        with open(input_image_path, "rb") as f:
            img_data = f.read()
        
        mime, _ = mimetypes.guess_type(input_image_path)
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=img_data, mime_type=mime or "image/jpeg"),
                    types.Part.from_text(text=shot_prompt),
                ],
            ),
        ]
        
        config = types.GenerateContentConfig(
            image_config=types.ImageConfig(aspect_ratio="16:9", image_size="4K"),
            response_modalities=["IMAGE"],
        )
        
        for chunk in client.models.generate_content_stream(model=model, contents=contents, config=config):
            if chunk.parts and chunk.parts[0].inline_data:
                data = chunk.parts[0].inline_data.data
                os.makedirs(os.path.dirname(destination_path), exist_ok=True)
                with open(destination_path, "wb") as out_f:
                    out_f.write(data)
                return f"Successfully generated image: {destination_path}"
    except Exception as e:
        return f"Error during generation: {e}"
            
    return "No image returned from Gemini."

def base64_to_image_file(base64_str: str, output_path: str) -> str:
    import base64
    try:
        header, encoded = base64_str.split(",", 1)
        data = base64.b64decode(encoded)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(data)
        return f"Image saved to {output_path}"
    except Exception as e:
        return f"Failed to save image: {e}"
    
def image_file_to_base64(image_path: str) -> str:
    import base64
    try:
        with open(image_path, "rb") as f:
            data = f.read()
        mime, _ = mimetypes.guess_type(image_path)
        base64_str = f"data:{mime};base64,{base64.b64encode(data).decode()}"
        return base64_str
    except Exception as e:
        return f"Failed to convert image to base64: {e}"

# Pydantic AI Tool Definitions
def get_photo_tools() -> List[Tool]:
    """Returns a list of Pydantic AI tools for photography processing."""
    return [
        Tool(
            _convert_heic_to_jpg,
            name="convert_heic_to_jpg",
            description="Converts all HEIC images in a directory to JPG while preserving folder structure."
        ),
        Tool(
            _convert_psd_to_jpg,
            name="convert_psd_to_jpg",
            description="Renders all PSD files in a directory to JPG using ImageMagick."
        ),
        Tool(
            _create_product_collages,
            name="create_product_collages",
            description="Generates product collages from folders of images."
        ),
        Tool(
            _remove_backgrounds,
            name="remove_backgrounds",
            description="Automated background removal for catalog shots, creating transparent and white variants."
        ),
        Tool(
            _upscale_images,
            name="upscale_images",
            description="Upscale images in a folder using AI (Real-ESRGAN or Replicate)."
        ),
        Tool(
            _generate_furniture_image,
            name="generate_furniture_image",
            description="Generates a single furniture image using Google Gemini API from an input reference image and a prompt."
        ),
        Tool(
            base64_to_image_file,
            name="base64_to_image_file",
            description="Converts a base64-encoded image string to an image file on disk."
        ),
        Tool(
            image_file_to_base64,
            name="image_file_to_base64",
            description="Converts an image file on disk to a base64-encoded string."
        ),
    ]
