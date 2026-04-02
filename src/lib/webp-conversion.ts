/**
 * WebP Conversion Module
 *
 * Mirrors backend: convert_webp(), convert_image_to_webp(),
 * check_image_dimensions_webp(), check_and_calculate_scaling()
 *
 * Uses @jsquash/webp (Google's Squoosh WASM encoder) for high-quality WebP output.
 *
 * Pipeline:
 *   1. Decode input (PNG/JPEG/other) to ImageData
 *   2. Optionally scale down if exceeding SCALED_IMAGE_DIMENSION_LIMIT
 *   3. Check WebP dimension limits
 *   4. Encode to WebP via WASM
 */

import type { WebPConversionResult, ScalingInfo } from "../types";
import { CONFIG } from "../types";

/**
 * Convert an image file to WebP format.
 *
 * @param file      - Source image File
 * @param imageData - Pre-decoded ImageData (from validation step); avoids double-decode
 * @param options   - Override default scaling/quality behavior
 */
export async function convertToWebP(
  file: File,
  imageData?: ImageData,
  options?: {
    enableScaling?: boolean;
    quality?: number;
    scaledDimensionLimit?: number;
  },
): Promise<WebPConversionResult> {
  const enableScaling = options?.enableScaling ?? true;
  const quality = options?.quality ?? CONFIG.WEBP_QUALITY;
  const scaledLimit = options?.scaledDimensionLimit ?? CONFIG.SCALED_IMAGE_DIMENSION_LIMIT;

  // Lazy-load WASM modules (tree-shakeable)
  const [{ encode: encodeWebP }, { default: resize }] = await Promise.all([
    import("@jsquash/webp"),
    import("@jsquash/resize"),
  ]);

  // Step 1: Get ImageData (reuse from validation or decode fresh)
  let data = imageData ?? (await decodeFileToImageData(file));

  let { width, height } = data;
  let scalingInfo: ScalingInfo | undefined;

  // Step 2: Check WebP dimension limit
  const maxDim = Math.max(width, height);
  if (maxDim > CONFIG.WEBP_MAX_DIMENSION) {
    throw new Error(
      `Image dimensions (${width}x${height}) exceed WebP limit of ${CONFIG.WEBP_MAX_DIMENSION}px`,
    );
  }

  // Step 3: Optional scaling for large images
  if (enableScaling && maxDim > scaledLimit) {
    const scalingFactor = scaledLimit / maxDim;
    const newWidth = Math.round(width * scalingFactor);
    const newHeight = Math.round(height * scalingFactor);

    data = await resize(data, { width: newWidth, height: newHeight });

    scalingInfo = {
      scalingFactor,
      originalWidth: width,
      originalHeight: height,
      scaledWidth: newWidth,
      scaledHeight: newHeight,
    };

    width = newWidth;
    height = newHeight;
  }

  // Step 4: Encode to WebP via WASM
  const webpBuffer = await encodeWebP(data, { quality });
  const webpBlob = new Blob([webpBuffer], { type: "image/webp" });

  return { webpBlob, scalingInfo };
}

/**
 * Decode a File to ImageData using the browser's built-in decoders.
 * Handles PNG, JPEG, WebP, BMP, GIF, etc.
 */
async function decodeFileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context from OffscreenCanvas");

  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  bitmap.close();

  return imageData;
}
