/**
 * Audio Extraction Module
 *
 * Mirrors backend: Video Processing Pipeline step 3 — Audio Processing
 *   - Extract audio track from video
 *   - Produce a standalone audio file for downstream STT processing
 *
 * Uses MediaBunny to demux and re-encode the audio track.
 *
 * NOTE: Speech-to-text submission remains a backend API call — this module
 * only handles the audio extraction step that runs in the browser.
 */

import {
  Input,
  BlobSource,
  Output,
  BufferTarget,
  Conversion,
  WavOutputFormat,
  Mp3OutputFormat,
  OggOutputFormat,
  ALL_FORMATS,
  type OutputFormat,
} from "mediabunny";

export type AudioFormat = "wav" | "mp3" | "ogg";

/**
 * Extract the audio track from a video file.
 *
 * @param videoFile    - Source video file
 * @param outputFormat - Desired audio format (default: "wav" for STT compatibility)
 * @returns            - Audio data as a Blob
 */
export async function extractAudioTrack(
  videoFile: File,
  outputFormat: AudioFormat = "wav",
): Promise<Blob> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(videoFile),
  });

  const formatMap: Record<AudioFormat, OutputFormat> = {
    wav: new WavOutputFormat(),
    mp3: new Mp3OutputFormat(),
    ogg: new OggOutputFormat(),
  };

  const mimeMap: Record<AudioFormat, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
  };

  const target = new BufferTarget();
  const output = new Output({ format: formatMap[outputFormat], target });

  const conversion = await Conversion.init({
    input,
    output,
    // Only include audio, discard video
    video: () => undefined,
    audio: {
      codec: outputFormat === "mp3" ? "mp3" : outputFormat === "ogg" ? "opus" : "pcm-s16",
    },
  });

  await conversion.execute();
  await output.finalize();

  input.dispose();

  return new Blob([target.buffer!], { type: mimeMap[outputFormat] });
}

/**
 * Check whether a video file has an audio track.
 *
 * @param videoFile - Source video file
 * @returns         - true if audio track exists
 */
export async function hasAudioTrack(videoFile: File): Promise<boolean> {
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(videoFile),
    });
    const audioTrack = await input.getPrimaryAudioTrack();
    const hasAudio = audioTrack != null;
    input.dispose();
    return hasAudio;
  } catch {
    return false;
  }
}
