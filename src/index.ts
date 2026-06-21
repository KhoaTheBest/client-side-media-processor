/**
 * @pencil/frontend-asset-processor
 *
 * Frontend asset processing pipeline for images and videos.
 * Replaces selected backend Python processing with browser-native + WASM solutions.
 *
 * Image processing:  jSquash (Google's Squoosh WASM codecs)
 * Video processing:  MediaBunny (WebCodecs-based)
 */

// ── Types ────────────────────────────────────────────
export type {
  ValidationResult,
  ScalingInfo,
  SegmentationResult,
  WhiteBackgroundResult,
  WebPConversionResult,
  ThumbnailResult,
  VideoPreprocessResult,
  TranscodeOptions,
  VideoAttributes,
  ProductAssetResult,
  ProgressCallback,
} from "./types";

export { IsProductType, CONFIG } from "./types";

// ── Image Processing ─────────────────────────────────
export { validateImageDimensions } from "./lib/image-validation";
export { isSegmentedImage, detectWhiteBackground } from "./lib/segmentation-detection";
export { convertToWebP } from "./lib/webp-conversion";
export { generateThumbnail } from "./lib/thumbnail-generation";

// ── Video Processing ─────────────────────────────────
export { preprocessVideo, extractVideoThumbnail } from "./lib/video-preprocessing";
export { transcodeVideo, trimVideo, transcodeVideoFFmpeg, transcodeVideoMediaBunny } from "./lib/video-transcoding";
export { extractVideoAttributes, validateVideoFile } from "./lib/video-metadata";
export { extractAudioTrack, hasAudioTrack } from "./lib/audio-extraction";

// ── Pipeline Orchestrators ───────────────────────────
export { processProductAsset, processVideoAsset } from "./lib/asset-pipeline";
export type { VideoAssetResult } from "./lib/asset-pipeline";
