/**
 * Segmentation Detection Module
 *
 * Mirrors backend: is_segmented_image(), get_override_segment(),
 * is_product_on_white_background(), is_product_on_white_background_helper()
 *
 * Two-stage detection:
 *   1. Alpha-channel check — fast path for already-segmented images
 *   2. Flood-fill white-background detection — determines if product sits on white bg
 */

import type { SegmentationResult, WhiteBackgroundResult } from "../types";
import { CONFIG, IsProductType } from "../types";

// ──────────────────────────────────────────────────────
// 1. Alpha-channel segmentation check
// ──────────────────────────────────────────────────────

/**
 * Check if an image is already segmented (has transparent background).
 *
 * Mirrors backend `is_segmented_image()`:
 *   - Checks for alpha channel with meaningful transparency
 *   - If transparent pixel ratio > threshold → segmented
 *
 * @param imageData - RGBA ImageData from canvas
 */
export function isSegmentedImage(imageData: ImageData): SegmentationResult {
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  let transparentCount = 0;
  let hasNonOpaquePixel = false;

  // Walk the alpha channel (every 4th byte in RGBA)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasNonOpaquePixel = true;
      transparentCount++;
    }
  }

  if (!hasNonOpaquePixel) {
    return {
      isSegmented: false,
      hasAlphaChannel: false,
      transparentPixelRatio: 0,
    };
  }

  const transparentRatio = transparentCount / totalPixels;
  // Backend: transparent_pixels_ratio > (1.0 - MIN_PRODUCT_EMPTY_AREA_RATIO)
  const isSegmented = transparentRatio > 1.0 - CONFIG.MIN_PRODUCT_EMPTY_AREA_RATIO;

  return {
    isSegmented,
    hasAlphaChannel: true,
    transparentPixelRatio: transparentRatio,
  };
}

// ──────────────────────────────────────────────────────
// 2. White-background flood-fill detection
// ──────────────────────────────────────────────────────

/**
 * Detect whether an image is a product on a white background.
 *
 * Mirrors backend `get_override_segment()` → `is_product_on_white_background()`
 * → `is_product_on_white_background_helper()`.
 *
 * Algorithm:
 *   1. Check alpha first (fast path → SEGMENTABLE)
 *   2. Convert to grayscale
 *   3. Add thin white border
 *   4. Rescale intensity to darken near-whites
 *   5. Flood fill from (0,0)
 *   6. Classify based on diff fraction & stuck-edge ratios
 *
 * @param imageData - RGBA ImageData from canvas
 */
export function detectWhiteBackground(imageData: ImageData): WhiteBackgroundResult {
  // Fast path: already has alpha transparency
  const segResult = isSegmentedImage(imageData);
  if (segResult.hasAlphaChannel && segResult.isSegmented) {
    return {
      productType: IsProductType.SEGMENTABLE_PRODUCT,
      overrideSegment: true,
      unsegmentable: false,
    };
  }

  const { data, width, height } = imageData;

  // Convert to grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    gray[i] = Math.round(0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2]);
  }

  // Add border
  const borderPx = Math.min(
    Math.max(1, Math.round(CONFIG.BORDER_FRAC * Math.sqrt(width * height))),
    5,
  );
  const bw = width + 2 * borderPx;
  const bh = height + 2 * borderPx;
  const bordered = new Uint8Array(bw * bh).fill(255);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bordered[(y + borderPx) * bw + (x + borderPx)] = gray[y * width + x];
    }
  }

  // Rescale intensity: darken whites
  const rescaled = new Uint8Array(bordered.length);
  for (let i = 0; i < bordered.length; i++) {
    rescaled[i] = Math.round((bordered[i] / 255) * CONFIG.CONTRAST_RED * 255);
  }

  // Re-whiten border edges
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (y < borderPx || y >= bh - borderPx || x < borderPx || x >= bw - borderPx) {
        rescaled[y * bw + x] = 255;
      }
    }
  }

  // Flood fill from (0,0)
  const filled = new Uint8Array(rescaled);
  floodFill(filled, bw, bh, 0, 0, 255, CONFIG.FLOOD_TOL);

  // Calculate diff fraction
  let diffCount = 0;
  for (let i = 0; i < rescaled.length; i++) {
    if (rescaled[i] !== filled[i]) diffCount++;
  }
  const diffFraction = diffCount / (bw * bh);

  // Check stuck edges (inspect inward by borderPx from each side)
  let sumEdges = 0;
  let numEdges = 0;

  // Left edge
  for (let y = 0; y < bh; y++) {
    for (let x = borderPx; x < 2 * borderPx; x++) {
      if (filled[y * bw + x] === 255) sumEdges++;
      numEdges++;
    }
  }
  // Top edge
  for (let y = borderPx; y < 2 * borderPx; y++) {
    for (let x = 0; x < bw; x++) {
      if (filled[y * bw + x] === 255) sumEdges++;
      numEdges++;
    }
  }
  // Right edge
  for (let y = 0; y < bh; y++) {
    for (let x = bw - 2 * borderPx; x < bw - borderPx; x++) {
      if (filled[y * bw + x] === 255) sumEdges++;
      numEdges++;
    }
  }
  // Bottom edge
  for (let y = bh - 2 * borderPx; y < bh - borderPx; y++) {
    for (let x = 0; x < bw; x++) {
      if (filled[y * bw + x] === 255) sumEdges++;
      numEdges++;
    }
  }

  const edgeRatio = numEdges > 0 ? sumEdges / numEdges : 1.0;

  const stuckEdgesHigh = edgeRatio <= CONFIG.STUCK_EDGE_RATIO_HIGH;
  const stuckEdgesLow = edgeRatio <= CONFIG.STUCK_EDGE_RATIO_LOW;

  const isWhiteBg = diffFraction > CONFIG.IS_WHITE_BG_THR && !stuckEdgesHigh;
  const isWhiteBgWithStuckEdges = diffFraction > CONFIG.IS_WHITE_BG_THR && !stuckEdgesLow;

  let productType: IsProductType;
  if (isWhiteBg) {
    productType = IsProductType.SEGMENTABLE_PRODUCT;
  } else if (isWhiteBgWithStuckEdges) {
    productType = IsProductType.UNSEGMENTABLE_PRODUCT;
  } else {
    productType = IsProductType.NOT_PRODUCT;
  }

  return {
    productType,
    overrideSegment: productType !== IsProductType.NOT_PRODUCT,
    unsegmentable: productType === IsProductType.UNSEGMENTABLE_PRODUCT,
    diffFraction,
  };
}

// ──────────────────────────────────────────────────────
// Flood fill (iterative, stack-based)
// ──────────────────────────────────────────────────────

/**
 * Flood-fill on a grayscale Uint8Array grid from (startX, startY).
 * Mirrors backend's `skimage.morphology.flood_fill`.
 */
function floodFill(
  data: Uint8Array,
  w: number,
  h: number,
  startX: number,
  startY: number,
  fillValue: number,
  tolerance: number,
): void {
  const idx0 = startY * w + startX;
  const target = data[idx0];

  // Use a typed-array stack for performance on large images
  const stack: number[] = [startX, startY];
  const visited = new Uint8Array(w * h);

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    if (x < 0 || x >= w || y < 0 || y >= h) continue;

    const idx = y * w + x;
    if (visited[idx]) continue;
    if (Math.abs(data[idx] - target) > tolerance) continue;

    visited[idx] = 1;
    data[idx] = fillValue;

    stack.push(x + 1, y);
    stack.push(x - 1, y);
    stack.push(x, y + 1);
    stack.push(x, y - 1);
  }
}
