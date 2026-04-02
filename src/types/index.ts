// ──────────────────────────────────────────────────────
// Shared types for the frontend asset processing pipeline
// ──────────────────────────────────────────────────────

/** Result of image dimension validation */
export interface ValidationResult {
  valid: boolean;
  scaled: boolean;
  scalingInfo?: ScalingInfo;
  imageData?: ImageData;
  error?: string;
}

/** Metadata about any scaling that was applied */
export interface ScalingInfo {
  scalingFactor: number;
  originalWidth: number;
  originalHeight: number;
  scaledWidth?: number;
  scaledHeight?: number;
}

/** Segmentation analysis result */
export interface SegmentationResult {
  isSegmented: boolean;
  hasAlphaChannel: boolean;
  transparentPixelRatio: number;
}

/** Classification of product type from white-background detection */
export enum IsProductType {
  SEGMENTABLE_PRODUCT = "SEGMENTABLE_PRODUCT",
  UNSEGMENTABLE_PRODUCT = "UNSEGMENTABLE_PRODUCT",
  NOT_PRODUCT = "NOT_PRODUCT",
}

/** White-background detection result */
export interface WhiteBackgroundResult {
  productType: IsProductType;
  overrideSegment: boolean;
  unsegmentable: boolean;
  diffFraction?: number;
}

/** Result of WebP conversion */
export interface WebPConversionResult {
  webpBlob: Blob;
  scalingInfo?: ScalingInfo;
}

/** Result of thumbnail generation */
export interface ThumbnailResult {
  thumbnailBlob: Blob;
  width: number;
  height: number;
}

/** Video preprocessing result */
export interface VideoPreprocessResult {
  trimmedBlob?: Blob;
  thumbnailBlob?: Blob;
  duration: number;
}

/** Video transcoding options */
export interface TranscodeOptions {
  outputFormat: "mp4" | "webm";
  videoBitrate?: number;
  audioBitrate?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/** Extracted video metadata */
export interface VideoAttributes {
  duration: number;
  width: number;
  height: number;
  codec: string;
  frameRate: number;
  bitrate: number;
  audioCodec?: string;
  audioSampleRate?: number;
  fileSize: number;
}

/** Full product asset processing result */
export interface ProductAssetResult {
  webpBlob: Blob;
  thumbnailBlob: Blob;
  segmentation: {
    isSegmented: boolean;
    overrideSegment: boolean;
    unsegmentable: boolean;
  };
  scalingInfo?: ScalingInfo;
}

/** Progress callback signature */
export type ProgressCallback = (progress: number, step: string) => void;

/** Configuration constants — mirrors backend config values */
export const CONFIG = {
  /** Reject images exceeding this dimension (pixels) */
  VALID_IMAGE_DIMENSION_LIMIT: 25_000,
  /** Scale down to this if between this and VALID limit */
  ORIGINAL_IMAGE_DIMENSION_LIMIT: 16_000,
  /** WebP max dimension */
  WEBP_MAX_DIMENSION: 16_000,
  /** Scale down to this for WebP output */
  SCALED_IMAGE_DIMENSION_LIMIT: 4_096,
  /** Minimum transparent area ratio to consider image segmented */
  MIN_PRODUCT_EMPTY_AREA_RATIO: 0.15,
  /** Thumbnail max dimensions */
  THUMBNAIL_MAX_WIDTH: 300,
  THUMBNAIL_MAX_HEIGHT: 300,
  /** WebP encoding quality (0–100) */
  WEBP_QUALITY: 80,
  /** Thumbnail WebP quality */
  THUMBNAIL_QUALITY: 75,
  /** White background flood-fill threshold */
  IS_WHITE_BG_THR: 0.05,
  /** Flood fill tolerance (0–255) */
  FLOOD_TOL: 30,
  /** Contrast reduction factor for white-bg detection */
  CONTRAST_RED: 0.85,
  /** Edge stuck ratio thresholds */
  STUCK_EDGE_RATIO_HIGH: 0.7,
  STUCK_EDGE_RATIO_LOW: 0.5,
  /** Border fraction for white-bg padding */
  BORDER_FRAC: 0.02,
} as const;
