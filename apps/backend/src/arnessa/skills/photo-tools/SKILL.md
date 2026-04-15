---
name: photo-tools
description: Process furniture photography, remove backgrounds, upscale images, and generate AI furniture images using Gemini. Use when working with product catalogs or generating marketing visuals.
---

# Photo Tools

A specialized skill for automating the furniture photography pipeline, from raw file conversion to AI-enhanced final renders.

## When to use this skill
Use this skill when you need to:
- Convert professional furniture photos (HEIC, PSD) to standard web formats.
- Clean up catalog shots by removing backgrounds and normalizing to white.
- Generate new lifestyle furniture images using Gemini.
- Upscale low-resolution or AI-generated images for production use.
- Create product variant collages for review and quality control.

## Available Resources

### `photo_types.csv`
A database of shot types (`catalog_front`, `terrace_restaurant`, etc.) and their corresponding prompt templates. **Always use this to construct prompts for image generation.**

## Associated tools (not in this skill but commonly used together)

- `convert_heic_to_jpg`: Converts all HEIC images in a directory to JPG.
- `convert_psd_to_jpg`: Renders all PSD files in a directory to JPG.
- `remove_backgrounds`: Automated background removal for catalog shots.
- `upscale_images`: AI upscaling for images in a folder.
- `create_product_collages`: Generates product collages from folders of images.
- `generate_furniture_image`: Generates a single furniture image from a reference photo and a prompt.

## Gotchas

- **Background Removal**: `remove_backgrounds` works best on high-contrast edges. If a chair has thin metal legs or mesh, inspect the output for missing details.
- **Upscaling VRAM**: For local upscaling, large images may require significant VRAM. The tool uses tiling to mitigate this.
- **Gemini Context**: `generate_furniture_image` requires an input image to maintain furniture structure for "lifestyle" shots.
- **ImageMagick**: Conversion tools require ImageMagick (`convert` or `magick`) to be installed on the system.

## Workflows

### 0. Check for catalog photos
You can check the `photo_types.csv` for potential matches of prompts for what the user is asking for. Also remember that user wishes can override the csv prompts partly or fully. So you can use the csv as a base and then modify the prompt based on user wishes.

### 1. Catalog Normalization
Transform raw photos into clean, white-background catalog shots.
1. Convert source files to JPG using `convert_heic_to_jpg` or `convert_psd_to_jpg`.
2. Use `remove_backgrounds` with `input_dir` and `output_dir`.
3. **Verify**: Check the output directory for the `_whitebg.png` variants.

### 2. Lifestyle Generation
Generate "in-situ" (lifestyle) shots based on catalog photos.
1. Select a catalog photo as the base.
2. Fetch the base prompt from `photo_types.csv` matching the target `Shot Type` and `Product Type`.
3. Use `generate_furniture_image` with the input path, your constructed prompt, and the destination path.

### 3. Production Upscaling
Prepare generated or small images for high-res output.
1. Use `upscale_images` on the target folder with desired `scale`.
