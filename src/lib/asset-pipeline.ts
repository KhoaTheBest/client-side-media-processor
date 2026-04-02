/**
 * Asset Pipeline Orchestrator
 *
 * High-level orchestrator that chains all processing steps together
 * for both product assets and video assets.
 *
 * Product Asset Flow:
 *   1. validate dimensions → 2. detect segmentation → 3. convert to WebP → 4. generate thumbnail
 *
 * Video Asset Flow:
 *   1. validate → 2. preprocess (trim/thumbnail) → 3. extract metadata → 4. extract audio
 */

import type {
  ProductAssetResult,
  VideoPreprocessResult,
  VideoAttributes,
  ProgressCallback,
  TranscodeOptions,
} from "../types";
import { validateImageDimensions } from "./image-validation";
import { isSegmentedImage, detectWhiteBackground } from "./segmentation-detection";
import { convertToWebP } from "./webp-conversion";
import { generateThumbnail } from "./thumbnail-generation";
import { preprocessVideo } from "./video-preprocessing";
import { transcodeVideo } from "./video-transcoding";
import { extractVideoAttributes, validateVideoFile } from "./video-metadata";
import { extractAudioTrack, hasAudioTrack } from "./audio-extraction";

// ──────────────────────────────────────────────────────
// Product Asset Pipeline
// ──────────────────────────────────────────────────────

/**
 * Process a product (image) asset through the full pipeline.
 *
 * Mirrors backend `asset_processor()` → `process_product_asset()` flow.
 *
 * @param file       - Image file from user input
 * @param onProgress - Optional callback for progress updates
 */
export async function processProductAsset(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ProductAssetResult> {
  // Step 1: Validate dimensions (0% → 10%)
  onProgress?.(0, "Validating image dimensions...");
  const validation = await validateImageDimensions(file);

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const imageData = validation.imageData!;

  // Step 2: Segmentation detection (10% → 20%)
  onProgress?.(10, "Detecting segmentation...");
  const segResult = isSegmentedImage(imageData);
  const bgResult = detectWhiteBackground(imageData);

  // Step 3: WebP conversion (20% → 50%)
  onProgress?.(20, "Converting to WebP...");
  const { webpBlob, scalingInfo } = await convertToWebP(file, imageData);

  // Step 4: Prepare ImageData from WebP for thumbnail
  onProgress?.(50, "Generating thumbnail...");
  const webpBitmap = await createImageBitmap(webpBlob);
  const canvas = new OffscreenCanvas(webpBitmap.width, webpBitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(webpBitmap, 0, 0);
  const webpImageData = ctx.getImageData(0, 0, webpBitmap.width, webpBitmap.height);
  webpBitmap.close();

  // Step 5: Thumbnail generation (50% → 100%)
  const { thumbnailBlob } = await generateThumbnail(webpImageData);

  onProgress?.(100, "Complete");

  return {
    webpBlob,
    thumbnailBlob,
    segmentation: {
      isSegmented: segResult.isSegmented,
      overrideSegment: bgResult.overrideSegment,
      unsegmentable: bgResult.unsegmentable,
    },
    scalingInfo,
  };
}

// ──────────────────────────────────────────────────────
// Video Asset Pipeline
// ──────────────────────────────────────────────────────

export interface VideoAssetResult {
  /** Preprocessed video (trimmed if applicable) */
  processedBlob?: Blob;
  /** Transcoded video blob */
  transcodedBlob?: Blob;
  /** WebP thumbnail from video frame */
  thumbnailBlob?: Blob;
  /** Extracted audio track (for STT) */
  audioBlob?: Blob;
  /** Video metadata */
  attributes: VideoAttributes;
  /** Whether video has an audio track */
  hasAudio: boolean;
}

/**
 * Process a video asset through the full pipeline.
 *
 * Mirrors backend video_preprocessor() + video_processor() flow.
 *
 * @param file       - Video file from user input
 * @param options    - Processing options
 * @param onProgress - Optional progress callback
 */
export async function processVideoAsset(
  file: File,
  options?: {
    trimStartMs?: number;
    trimEndMs?: number;
    transcode?: TranscodeOptions;
    extractAudio?: boolean;
  },
  onProgress?: ProgressCallback,
): Promise<VideoAssetResult> {
  // Step 1: Validate (0% → 10%)
  onProgress?.(0, "Validating video file...");
  const validation = await validateVideoFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const attributes = validation.attributes!;

  // Step 2: Preprocess — trim + thumbnail (10% → 40%)
  onProgress?.(10, "Preprocessing video...");
  const preprocessResult: VideoPreprocessResult = await preprocessVideo(file, {
    trimStartMs: options?.trimStartMs,
    trimEndMs: options?.trimEndMs,
    generateThumbnail: true,
  });

  const sourceBlob = preprocessResult.trimmedBlob ?? file;

  // Step 3: Transcode if requested (40% → 70%)
  let transcodedBlob: Blob | undefined;
  if (options?.transcode) {
    onProgress?.(40, "Transcoding video...");
    transcodedBlob = await transcodeVideo(
      sourceBlob instanceof File ? sourceBlob : new File([sourceBlob], file.name),
      options.transcode,
    );
  }

  // Step 4: Extract audio if requested (70% → 90%)
  let audioBlob: Blob | undefined;
  const audioExists = await hasAudioTrack(file);

  if (options?.extractAudio !== false && audioExists) {
    onProgress?.(70, "Extracting audio track...");
    const audioSource =
      transcodedBlob ?? (sourceBlob instanceof File ? sourceBlob : new File([sourceBlob], file.name));
    audioBlob = await extractAudioTrack(audioSource as File, "wav");
  }

  onProgress?.(100, "Complete");

  return {
    processedBlob: preprocessResult.trimmedBlob,
    transcodedBlob,
    thumbnailBlob: preprocessResult.thumbnailBlob,
    audioBlob,
    attributes,
    hasAudio: audioExists,
  };
}
