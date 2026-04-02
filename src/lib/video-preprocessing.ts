/**
 * Video Preprocessing Module
 *
 * Mirrors backend: video_preprocessor() from video_processor/processors.py
 *
 * Handles:
 *   - Video trimming (start/end ms)
 *   - Thumbnail extraction from a video frame
 *
 * Uses MediaBunny for video manipulation and HTML5 Video + Canvas for thumbnail capture.
 */

import type { VideoPreprocessResult } from "../types";

/**
 * Preprocess a video file: optional trim + thumbnail generation.
 *
 * @param file    - Source video File
 * @param options - Trim parameters and thumbnail toggle
 */
export async function preprocessVideo(
  file: File,
  options?: {
    trimStartMs?: number;
    trimEndMs?: number;
    generateThumbnail?: boolean;
  },
): Promise<VideoPreprocessResult> {
  const result: VideoPreprocessResult = { duration: 0 };

  // Get basic duration from HTML5 Video
  result.duration = await getVideoDuration(file);

  // Step 1: Trim if parameters provided
  if (options?.trimStartMs != null && options?.trimEndMs != null) {
    const { trimVideo } = await import("./video-transcoding");
    result.trimmedBlob = await trimVideo(file, options.trimStartMs, options.trimEndMs);
  }

  // Step 2: Generate thumbnail from video frame
  if (options?.generateThumbnail !== false) {
    result.thumbnailBlob = await extractVideoThumbnail(
      options?.trimStartMs != null && result.trimmedBlob ? result.trimmedBlob : file,
      result.duration,
    );
  }

  return result;
}

/**
 * Extract a thumbnail image (WebP) from a video at ~10% of duration or 1s.
 */
export async function extractVideoThumbnail(
  source: File | Blob,
  duration: number,
  seekTimeMs?: number,
): Promise<Blob> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  const url = URL.createObjectURL(source);
  video.src = url;

  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Video thumbnail extraction timed out after 30s"));
      }, 30_000);

      video.onloadeddata = () => {
        // Seek to requested time, or 10% of duration, or 1s — whichever is smallest
        const seekTime = seekTimeMs != null ? seekTimeMs / 1000 : Math.min(1, duration * 0.1);
        video.currentTime = seekTime;
      };

      video.onseeked = async () => {
        clearTimeout(timeout);
        try {
          const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Failed to get 2D context");

          ctx.drawImage(video, 0, 0);
          const blob = await canvas.convertToBlob({
            type: "image/webp",
            quality: 0.75,
          });
          resolve(blob);
        } catch (err) {
          reject(err);
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load video for thumbnail: ${video.error?.message}`));
      };
    });
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
    video.load(); // Release resources
  }
}

/**
 * Get video duration using HTML5 Video element.
 */
async function getVideoDuration(file: File | Blob): Promise<number> {
  const video = document.createElement("video");
  video.preload = "metadata";
  const url = URL.createObjectURL(file);
  video.src = url;

  try {
    return await new Promise<number>((resolve, reject) => {
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Failed to load video metadata"));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
