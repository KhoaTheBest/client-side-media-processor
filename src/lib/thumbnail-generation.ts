/**
 * Thumbnail Generation Module
 *
 * Mirrors backend: generate_thumbnail()
 *
 * Resizes an image to fit within THUMBNAIL_MAX dimensions (preserving aspect ratio)
 * and encodes as WebP. Uses @jsquash/resize for Lanczos-quality downscaling
 * and @jsquash/webp for encoding.
 */

import type { ThumbnailResult } from "../types";
import { CONFIG } from "../types";

/**
 * Generate a WebP thumbnail from ImageData.
 *
 * Mirrors backend PIL's `Image.thumbnail()` behavior:
 *   - Preserves aspect ratio
 *   - Never upscales
 *   - Fits within maxWidth x maxHeight box
 *
 * @param imageData - Source RGBA ImageData
 * @param options   - Override max dimensions or quality
 */
export async function generateThumbnail(
  imageData: ImageData,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  },
): Promise<ThumbnailResult> {
  const maxWidth = options?.maxWidth ?? CONFIG.THUMBNAIL_MAX_WIDTH;
  const maxHeight = options?.maxHeight ?? CONFIG.THUMBNAIL_MAX_HEIGHT;
  const quality = options?.quality ?? CONFIG.THUMBNAIL_QUALITY;

  const { width, height } = imageData;

  // Calculate thumbnail dimensions (same logic as PIL's thumbnail)
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  const thumbWidth = Math.round(width * ratio);
  const thumbHeight = Math.round(height * ratio);

  // Lazy-load WASM modules
  const [{ default: resize }, { encode: encodeWebP }] = await Promise.all([
    import("@jsquash/resize"),
    import("@jsquash/webp"),
  ]);

  // Resize (Lanczos3 by default in jSquash)
  let resizedData: ImageData;
  if (ratio < 1) {
    resizedData = await resize(imageData, {
      width: thumbWidth,
      height: thumbHeight,
    });
  } else {
    // No resize needed — image is already smaller than thumbnail limits
    resizedData = imageData;
  }

  // Encode to WebP
  const webpBuffer = await encodeWebP(resizedData, { quality });
  const thumbnailBlob = new Blob([webpBuffer], { type: "image/webp" });

  return {
    thumbnailBlob,
    width: thumbWidth,
    height: thumbHeight,
  };
}
