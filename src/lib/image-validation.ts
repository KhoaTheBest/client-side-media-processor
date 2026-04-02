/**
 * Image Validation Module
 *
 * Mirrors backend: validate_image_dimensions(), check_image_dimensions_valid(),
 * check_and_scale_original(), scale_image()
 *
 * Pipeline:
 *   1. Reject if any dimension > 25,000px
 *   2. Scale down to 16,000px if in the 16k–25k range
 *   3. Return ImageData for downstream processing
 */

import type { ValidationResult } from "../types";
import { CONFIG } from "../types";

/**
 * Validate image dimensions and optionally scale down large images.
 *
 * @param file - The image File from user input
 * @returns ValidationResult with ImageData ready for further processing
 */
export async function validateImageDimensions(
  file: File,
): Promise<ValidationResult> {
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      valid: false,
      scaled: false,
      error: `Failed to decode image file: "${file.name}". The file may be corrupt or an unsupported format.`,
    };
  }

  const { width, height } = bitmap;
  const maxDimension = Math.max(width, height);

  // Step 1: Reject if > 25k pixels
  if (maxDimension > CONFIG.VALID_IMAGE_DIMENSION_LIMIT) {
    bitmap.close();
    return {
      valid: false,
      scaled: false,
      error: `Image dimensions (${width}x${height}) exceed the maximum limit of ${CONFIG.VALID_IMAGE_DIMENSION_LIMIT}px.`,
    };
  }

  // Step 2: Scale down if in 16k–25k range
  if (maxDimension > CONFIG.ORIGINAL_IMAGE_DIMENSION_LIMIT) {
    const scalingFactor = CONFIG.ORIGINAL_IMAGE_DIMENSION_LIMIT / maxDimension;
    const newWidth = Math.round(width * scalingFactor);
    const newHeight = Math.round(height * scalingFactor);

    const imageData = await scaleWithCanvas(bitmap, width, height, newWidth, newHeight);
    bitmap.close();

    return {
      valid: true,
      scaled: true,
      scalingInfo: {
        scalingFactor,
        originalWidth: width,
        originalHeight: height,
        scaledWidth: newWidth,
        scaledHeight: newHeight,
      },
      imageData,
    };
  }

  // Step 3: Within limits — extract ImageData at original size
  const imageData = bitmapToImageData(bitmap, width, height);
  bitmap.close();

  return { valid: true, scaled: false, imageData };
}

/**
 * Scale an ImageBitmap down using OffscreenCanvas (browser Lanczos-quality resize).
 */
async function scaleWithCanvas(
  bitmap: ImageBitmap,
  _srcW: number,
  _srcH: number,
  dstW: number,
  dstH: number,
): Promise<ImageData> {
  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context from OffscreenCanvas");

  // The browser applies high-quality interpolation by default
  ctx.drawImage(bitmap, 0, 0, dstW, dstH);
  return ctx.getImageData(0, 0, dstW, dstH);
}

/**
 * Extract ImageData from an ImageBitmap at its original dimensions.
 */
function bitmapToImageData(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): ImageData {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context from OffscreenCanvas");

  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, width, height);
}
