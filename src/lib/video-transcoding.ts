/**
 * Video Transcoding Module
 *
 * Mirrors backend: video_transcoder_publish(), local FFmpeg transcoding
 *
 * Uses MediaBunny for browser-based transcoding via WebCodecs API.
 * Supports MP4 (H.264/AAC) and WebM (VP9/Opus) output.
 */

import type { TranscodeOptions } from "../types";
import {
  Input,
  BlobSource,
  Output,
  BufferTarget,
  Conversion,
  Mp4OutputFormat,
  WebMOutputFormat,
  ALL_FORMATS,
} from "mediabunny";

/**
 * Create a MediaBunny Input from a File or Blob.
 */
function createInput(source: File | Blob): Input {
  return new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(source),
  });
}

/**
 * Transcode a video file to a target format.
 *
 * @param file    - Source video file
 * @param options - Transcoding options (format, bitrate, resolution)
 * @returns       - Transcoded video as a Blob
 */
export async function transcodeVideo(
  file: File,
  options: TranscodeOptions,
): Promise<Blob> {
  const input = createInput(file);

  const format =
    options.outputFormat === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat();
  const target = new BufferTarget();

  const output = new Output({ format, target });

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      codec: options.outputFormat === "mp4" ? "avc" : "vp9",
      ...(options.videoBitrate && { bitrate: options.videoBitrate * 1000 }),
    },
    audio: {
      codec: options.outputFormat === "mp4" ? "aac" : "opus",
      ...(options.audioBitrate && { bitrate: options.audioBitrate * 1000 }),
    },
  });

  await conversion.execute();
  await output.finalize();

  const mimeType = options.outputFormat === "mp4" ? "video/mp4" : "video/webm";
  return new Blob([target.buffer!], { type: mimeType });
}

/**
 * Trim a video to a specific time range.
 *
 * @param file      - Source video file
 * @param startMs   - Trim start time in milliseconds
 * @param endMs     - Trim end time in milliseconds
 * @returns         - Trimmed video as a Blob
 */
export async function trimVideo(
  file: File | Blob,
  startMs: number,
  endMs: number,
): Promise<Blob> {
  const input = createInput(file);

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });

  const conversion = await Conversion.init({
    input,
    output,
    trim: {
      start: startMs / 1000,
      end: endMs / 1000,
    },
  });

  await conversion.execute();
  await output.finalize();

  return new Blob([target.buffer!], { type: "video/mp4" });
}
