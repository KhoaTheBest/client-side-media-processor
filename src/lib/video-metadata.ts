/**
 * Video Metadata Module
 *
 * Mirrors backend: Video Processing Pipeline steps 1–2
 *   - Validation & Setup (load video, validate status)
 *   - Video Attributes (extract metadata: duration, dimensions, codecs, etc.)
 *
 * Uses MediaBunny for codec-level metadata and HTML5 Video for dimensions.
 */

import type { VideoAttributes } from "../types";
import { Input, BlobSource, ALL_FORMATS } from "mediabunny";

/**
 * Extract comprehensive video attributes from a file.
 *
 * Combines MediaBunny metadata (codecs, bitrate) with HTML5 Video element
 * metadata (precise dimensions).
 *
 * @param file - Video file to analyze
 */
export async function extractVideoAttributes(file: File): Promise<VideoAttributes> {
  // Run both metadata sources in parallel
  const [mbMeta, htmlMeta] = await Promise.all([
    getMediaBunnyMetadata(file),
    getHTML5VideoMetadata(file),
  ]);

  return {
    duration: htmlMeta.duration,
    width: htmlMeta.width || mbMeta.width,
    height: htmlMeta.height || mbMeta.height,
    codec: mbMeta.videoCodec,
    frameRate: mbMeta.frameRate,
    bitrate: mbMeta.bitrate,
    audioCodec: mbMeta.audioCodec,
    audioSampleRate: mbMeta.audioSampleRate,
    fileSize: file.size,
  };
}

/**
 * Validate that a video file can be processed.
 *
 * @param file       - Video file to validate
 * @param maxSizeMB  - Maximum allowed file size in MB (default: 500)
 */
export async function validateVideoFile(
  file: File,
  maxSizeMB = 500,
): Promise<{ valid: boolean; error?: string; attributes?: VideoAttributes }> {
  // Check file size
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `Video file size (${sizeMB.toFixed(1)}MB) exceeds maximum of ${maxSizeMB}MB`,
    };
  }

  // Check MIME type
  const validTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];
  if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
    return {
      valid: false,
      error: `Unsupported video format: ${file.type || file.name.split(".").pop()}`,
    };
  }

  try {
    const attributes = await extractVideoAttributes(file);

    if (attributes.duration <= 0) {
      return { valid: false, error: "Video has zero or negative duration" };
    }

    return { valid: true, attributes };
  } catch (err) {
    return {
      valid: false,
      error: `Failed to read video metadata: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Internal helpers ────────────────────────────────

interface MediaBunnyMeta {
  videoCodec: string;
  frameRate: number;
  bitrate: number;
  width: number;
  height: number;
  audioCodec?: string;
  audioSampleRate?: number;
}

async function getMediaBunnyMetadata(file: File): Promise<MediaBunnyMeta> {
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file),
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();

    const result: MediaBunnyMeta = {
      videoCodec: videoTrack?.codec ?? "unknown",
      frameRate: 0,
      bitrate: 0,
      width: videoTrack?.displayWidth ?? 0,
      height: videoTrack?.displayHeight ?? 0,
      audioCodec: audioTrack?.codec ?? undefined,
      audioSampleRate: audioTrack?.sampleRate,
    };

    // Compute bitrate from packet stats if available
    if (videoTrack) {
      try {
        const stats = await videoTrack.computePacketStats();
        if (stats.averageBitrate) result.bitrate = stats.averageBitrate;
        if (stats.averagePacketRate) result.frameRate = stats.averagePacketRate;
      } catch {
        // Not all formats support packet stats
      }
    }

    input.dispose();
    return result;
  } catch {
    return {
      videoCodec: "unknown",
      frameRate: 0,
      bitrate: 0,
      width: 0,
      height: 0,
    };
  }
}

interface HTML5Meta {
  duration: number;
  width: number;
  height: number;
}

async function getHTML5VideoMetadata(file: File): Promise<HTML5Meta> {
  const video = document.createElement("video");
  video.preload = "metadata";
  const url = URL.createObjectURL(file);
  video.src = url;

  try {
    return await new Promise<HTML5Meta>((resolve, reject) => {
      video.onloadedmetadata = () => {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      };
      video.onerror = () =>
        reject(new Error(`Failed to load video metadata: ${video.error?.message}`));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
