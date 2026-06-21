/**
 * Video Transcoding Module
 *
 * Mirrors backend: video_transcoder_publish(), local FFmpeg transcoding
 *
 * Dual-Engine Transcoding:
 *   1. MediaBunny: Browser-based hardware accelerated transcoding via WebCodecs API.
 *   2. FFmpeg.wasm: Software-based WebAssembly transcoder using libx264/AAC.
 */

import type { TranscodeOptions } from "../types";
import {
  Input as MBInput,
  BlobSource as MBBlobSource,
  Output as MBOutput,
  BufferTarget as MBBufferTarget,
  Conversion as MBConversion,
  Mp4OutputFormat as MBMp4OutputFormat,
  WebMOutputFormat as MBWebMOutputFormat,
  ALL_FORMATS as MB_ALL_FORMATS,
} from "mediabunny";

/**
 * Create a MediaBunny Input from a File or Blob.
 */
function createInput(source: File | Blob): MBInput {
  return new MBInput({
    formats: MB_ALL_FORMATS,
    source: new MBBlobSource(source),
  });
}

/**
 * Transcode a video file using the MediaBunny (WebCodecs) engine.
 */
export async function transcodeVideoMediaBunny(
  file: File,
  options: TranscodeOptions,
): Promise<Blob> {
  const input = createInput(file);

  const format =
    options.outputFormat === "mp4" ? new MBMp4OutputFormat() : new MBWebMOutputFormat();
  const target = new MBBufferTarget();

  const output = new MBOutput({ format, target });

  const conversion = await MBConversion.init({
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
 * Transcode a video file using the FFmpeg.wasm (Software WebAssembly) engine.
 */
export async function transcodeVideoFFmpeg(
  file: File,
  options: TranscodeOptions,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  // Lazy load FFmpeg.wasm modules
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

  const ffmpeg = new FFmpeg();

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(progress);
    });
  }

  // Load cores from unpkg public CDN
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  // Write video to virtual filesystem
  await ffmpeg.writeFile("input.mp4", await fetchFile(file));

  // Build FFmpeg CLI arguments
  const args = ["-i", "input.mp4"];

  // Video settings
  if (options.outputFormat === "mp4") {
    args.push("-c:v", "libx264", "-preset", "ultrafast");
  } else {
    args.push("-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30");
  }

  if (options.videoBitrate) {
    args.push("-b:v", `${options.videoBitrate}k`);
  }

  // Audio settings
  if (options.outputFormat === "mp4") {
    args.push("-c:a", "aac");
  } else {
    args.push("-c:a", "libopus");
  }

  if (options.audioBitrate) {
    args.push("-b:a", `${options.audioBitrate}k`);
  }

  // Max dimension scaling if specified
  if (options.maxWidth || options.maxHeight) {
    const w = options.maxWidth ?? -2;
    const h = options.maxHeight ?? -2;
    args.push("-vf", `scale=${w}:${h}`);
  }

  const outputName = `output.${options.outputFormat}`;
  args.push(outputName);

  // Execute FFmpeg transcode
  await ffmpeg.exec(args);

  // Read transcoded output
  const data = await ffmpeg.readFile(outputName);
  const mimeType = options.outputFormat === "mp4" ? "video/mp4" : "video/webm";

  return new Blob([data as any], { type: mimeType });
}

/**
 * Transcode a video file to a target format (wrapper for dual engines).
 */
export async function transcodeVideo(
  file: File,
  options: TranscodeOptions,
): Promise<Blob> {
  // Default to MediaBunny if not specified
  return transcodeVideoMediaBunny(file, options);
}

/**
 * Trim a video to a specific time range.
 */
export async function trimVideo(
  file: File | Blob,
  startMs: number,
  endMs: number,
): Promise<Blob> {
  const input = createInput(file);

  const target = new MBBufferTarget();
  const output = new MBOutput({ format: new MBMp4OutputFormat(), target });

  const conversion = await MBConversion.init({
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
