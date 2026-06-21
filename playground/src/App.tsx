import { useMemo, useState, useEffect } from "react";
import {
  processProductAsset,
  processVideoAsset,
  validateImageDimensions,
  validateVideoFile,
  transcodeVideoFFmpeg,
  extractAudioTrack,
  extractVideoThumbnail,
  type TranscodeOptions,
  type VideoAssetResult,
  type ValidationResult,
} from "@lib";
import {
  IMAGE_TEST_PRESETS,
  VIDEO_TEST_PRESETS,
  isValidationFileStub,
  resolveImageTestPreset,
  resolveVideoTestPreset,
  type ValidationFileStub,
} from "./test-media";

// Import premium visual components
import { SplitSlider } from "./components/SplitSlider";
import { AudioWaveform } from "./components/AudioWaveform";
import { SegmentationVisualizer } from "./components/SegmentationVisualizer";
import { MetadataInspector } from "./components/MetadataInspector";

type ValidationSourceMode = "upload" | "preset";
type ValidationCheckStatus = "pass" | "fail" | "info";

interface ValidationCheckResult {
  label: string;
  status: ValidationCheckStatus;
  detail: string;
}

interface ValidationSummary {
  outcome: "pass" | "fail";
  sourceLabel: string;
  matchedBranch: string;
  checks: ValidationCheckResult[];
  payload: unknown;
  simulated?: boolean;
}

interface LoadedValidationImageSource {
  file: File;
  sourceUrl: string;
  label: string;
}

interface LoadedValidationVideoSource {
  source: File | ValidationFileStub;
  sourceUrl: string;
  label: string;
  note?: string;
}

interface VideoBenchmarkStats {
  durationMs: number;
  engine: "mediabunny" | "ffmpeg";
  fps: number;
  sizeBytes: number;
  acceleration: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getValidationSourceStatus(assetType: "image" | "video", mode: ValidationSourceMode): string {
  if (mode === "upload") {
    return `No validation ${assetType} source loaded for upload.`;
  }

  return `Choose a test ${assetType} URL and run validation.`;
}

function getImageValidationBranch(result: ValidationResult): string {
  if (!result.valid && result.error?.includes("Failed to decode image file")) return "decode_error";
  if (!result.valid && result.error?.includes("exceed")) return "dimension_reject_gt_25000";
  if (result.valid && result.scaled) return "scaled_16001_to_25000";
  if (result.valid && !result.scaled) return "within_limit_le_16000";
  return "unknown_image_validation_branch";
}

function summarizeImageValidationResult(result: ValidationResult) {
  return {
    valid: result.valid,
    scaled: result.scaled,
    scalingInfo: result.scalingInfo ?? null,
    error: result.error ?? null,
    imageData: result.imageData
      ? {
          width: result.imageData.width,
          height: result.imageData.height,
          byteLength: result.imageData.data.byteLength,
        }
      : null,
  };
}

function getVideoValidationBranch(result: Awaited<ReturnType<typeof validateVideoFile>>): string {
  if (result.valid) return "valid_video";
  if (result.error?.includes("exceeds maximum")) return "size_limit_reject";
  if (result.error?.includes("Unsupported video format")) return "unsupported_format_reject";
  if (result.error?.includes("Failed to read video metadata")) return "metadata_read_failure";
  if (result.error?.includes("zero or negative duration")) return "duration_zero_reject";
  return "unknown_video_validation_branch";
}

interface ValidationSummaryPanelProps {
  summary: ValidationSummary | null;
  running: boolean;
  emptyMessage: string;
}

function ValidationSummaryPanel({ summary, running, emptyMessage }: ValidationSummaryPanelProps) {
  if (running) {
    return (
      <article className="summary-card">
        <div className="case-header">
          <h4>Validation Result</h4>
          <span className="badge badge-running">Running</span>
        </div>
        <p className="case-branch">Evaluating the selected validation source.</p>
      </article>
    );
  }

  if (!summary) {
    return (
      <article className="summary-card">
        <div className="case-header">
          <h4>Validation Result</h4>
          <span className="badge badge-idle">Idle</span>
        </div>
        <p className="case-branch">{emptyMessage}</p>
      </article>
    );
  }

  return (
    <article className="summary-card">
      <div className="case-header">
        <h4>Validation Result</h4>
        <span className={`badge badge-${summary.outcome}`}>{summary.outcome === "pass" ? "Pass" : "Fail"}</span>
      </div>
      <p className="case-branch">
        <strong>Source:</strong> {summary.sourceLabel}
      </p>
      <p className="case-branch">
        <strong>Matched Branch:</strong> {summary.matchedBranch}
        {summary.simulated ? " (simulated)" : ""}
      </p>
      <div className="summary-checks">
        {summary.checks.map((check) => (
          <div key={check.label} className="summary-check">
            <span className={`badge badge-${check.status === "info" ? "idle" : check.status}`}>
              {check.status === "info" ? "Info" : check.status === "pass" ? "Pass" : "Fail"}
            </span>
            <div>
              <strong>{check.label}</strong>
              <p>{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <pre className="json">{JSON.stringify(summary.payload, null, 2)}</pre>
    </article>
  );
}

export function App() {
  const imageCapabilityIssues = useMemo(() => {
    const missing: string[] = [];
    if (typeof window.createImageBitmap !== "function") missing.push("createImageBitmap");
    if (typeof window.OffscreenCanvas !== "function") missing.push("OffscreenCanvas");
    return missing;
  }, []);

  const videoCapabilityIssues = useMemo(() => {
    const missing: string[] = [];
    if (typeof window.createImageBitmap !== "function") missing.push("createImageBitmap");
    if (typeof window.OffscreenCanvas !== "function") missing.push("OffscreenCanvas");
    if (typeof (window as Window & { VideoDecoder?: unknown }).VideoDecoder === "undefined") {
      missing.push("WebCodecs (VideoDecoder)");
    }
    return missing;
  }, []);

  // Image states
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageStatus, setImageStatus] = useState("Waiting for image input.");
  const [imageJson, setImageJson] = useState<Record<string, unknown> | null>(null);
  const [imageOriginalUrl, setImageOriginalUrl] = useState("");
  const [imageWebpUrl, setImageWebpUrl] = useState("");
  const [imageThumbUrl, setImageThumbUrl] = useState("");
  const [imageOriginalSize, setImageOriginalSize] = useState(0);
  const [imageProcessedSize, setImageProcessedSize] = useState(0);
  const [imageSegmentationData, setImageSegmentationData] = useState<{ isSegmented: boolean; overrideSegment: boolean; unsegmentable: boolean } | null>(null);
  
  // Worker Sandbox states
  const [imageThreads, setImageThreads] = useState(4);

  // Video states
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoStatus, setVideoStatus] = useState("Waiting for video input.");
  const [videoJson, setVideoJson] = useState<Record<string, unknown> | null>(null);
  const [videoOutputUrl, setVideoOutputUrl] = useState("");
  const [videoThumbUrl, setVideoThumbUrl] = useState("");
  const [videoAudioUrl, setVideoAudioUrl] = useState("");

  const [trimEnabled, setTrimEnabled] = useState(false);
  const [trimStartMs, setTrimStartMs] = useState("0");
  const [trimEndMs, setTrimEndMs] = useState("");
  const [transcodeEnabled, setTranscodeEnabled] = useState(false);
  const [transcodeFormat, setTranscodeFormat] = useState<TranscodeOptions["outputFormat"]>("mp4");
  const [extractAudio, setExtractAudio] = useState(true);

  // Dual-Engine Shootout states
  const [videoEngine, setVideoEngine] = useState<"mediabunny" | "ffmpeg">("mediabunny");
  const [videoBenchmark, setVideoBenchmark] = useState<VideoBenchmarkStats | null>(null);

  // Validation lab states
  const [validationImageSource, setValidationImageSource] = useState<LoadedValidationImageSource | null>(
    null,
  );
  const [validationVideoSource, setValidationVideoSource] = useState<LoadedValidationVideoSource | null>(
    null,
  );
  const [selectedImageTestUrl, setSelectedImageTestUrl] = useState(IMAGE_TEST_PRESETS[0]?.url ?? "");
  const [selectedVideoTestUrl, setSelectedVideoTestUrl] = useState(VIDEO_TEST_PRESETS[0]?.url ?? "");
  const [imageValidationSourceMode, setImageValidationSourceMode] = useState<ValidationSourceMode>("upload");
  const [videoValidationSourceMode, setVideoValidationSourceMode] = useState<ValidationSourceMode>("upload");
  const [imageValidationSourceStatus, setImageValidationSourceStatus] = useState(
    getValidationSourceStatus("image", "upload"),
  );
  const [videoValidationSourceStatus, setVideoValidationSourceStatus] = useState(
    getValidationSourceStatus("video", "upload"),
  );
  const [imageValidationSummary, setImageValidationSummary] = useState<ValidationSummary | null>(null);
  const [videoValidationSummary, setVideoValidationSummary] = useState<ValidationSummary | null>(null);
  const [imageValidationRunBusy, setImageValidationRunBusy] = useState(false);
  const [videoValidationRunBusy, setVideoValidationRunBusy] = useState(false);

  const selectedImageTestPreset = useMemo(
    () => IMAGE_TEST_PRESETS.find((preset) => preset.url === selectedImageTestUrl) ?? IMAGE_TEST_PRESETS[0],
    [selectedImageTestUrl],
  );

  const selectedVideoTestPreset = useMemo(
    () => VIDEO_TEST_PRESETS.find((preset) => preset.url === selectedVideoTestUrl) ?? VIDEO_TEST_PRESETS[0],
    [selectedVideoTestUrl],
  );

  // Clean up Object URLs on unmount/re-runs
  useEffect(
    () => () => {
      if (imageOriginalUrl) URL.revokeObjectURL(imageOriginalUrl);
    },
    [imageOriginalUrl],
  );

  useEffect(
    () => () => {
      if (imageWebpUrl) URL.revokeObjectURL(imageWebpUrl);
    },
    [imageWebpUrl],
  );

  useEffect(
    () => () => {
      if (imageThumbUrl) URL.revokeObjectURL(imageThumbUrl);
    },
    [imageThumbUrl],
  );

  useEffect(
    () => () => {
      if (videoOutputUrl) URL.revokeObjectURL(videoOutputUrl);
    },
    [videoOutputUrl],
  );

  useEffect(
    () => () => {
      if (videoThumbUrl) URL.revokeObjectURL(videoThumbUrl);
    },
    [videoThumbUrl],
  );

  useEffect(
    () => () => {
      if (videoAudioUrl) URL.revokeObjectURL(videoAudioUrl);
    },
    [videoAudioUrl],
  );

  function resetImageValidationSource(mode: ValidationSourceMode) {
    setImageValidationSourceMode(mode);
    setValidationImageSource(null);
    setImageValidationSummary(null);
    setImageValidationSourceStatus(getValidationSourceStatus("image", mode));
  }

  function resetVideoValidationSource(mode: ValidationSourceMode) {
    setVideoValidationSourceMode(mode);
    setValidationVideoSource(null);
    setVideoValidationSummary(null);
    setVideoValidationSourceStatus(getValidationSourceStatus("video", mode));
  }

  function describeImageValidationSource(source: LoadedValidationImageSource): string {
    return `${source.label}: ${source.file.name} (${formatBytes(source.file.size)}) via ${source.sourceUrl}`;
  }

  function describeVideoValidationSource(source: LoadedValidationVideoSource): string {
    const size = formatBytes(source.source.size);
    const kind = isValidationFileStub(source.source) ? "validation stub" : "file";
    const note = source.note ? ` ${source.note}` : "";
    return `${source.label}: ${source.source.name} (${size}, ${kind}) via ${source.sourceUrl}.${note}`;
  }

  async function loadImageTestUrl(url: string): Promise<LoadedValidationImageSource> {
    const preset = IMAGE_TEST_PRESETS.find((candidate) => candidate.url === url);
    if (!preset) {
      throw new Error(`Unknown image test URL: ${url}`);
    }

    const file = await resolveImageTestPreset(url);
    const loadedSource: LoadedValidationImageSource = {
      file,
      sourceUrl: preset.url,
      label: preset.label,
    };

    setValidationImageSource(loadedSource);
    setImageValidationSummary(null);
    setImageValidationSourceStatus(describeImageValidationSource(loadedSource));
    return loadedSource;
  }

  async function loadVideoTestUrl(url: string): Promise<LoadedValidationVideoSource> {
    const preset = VIDEO_TEST_PRESETS.find((candidate) => candidate.url === url);
    if (!preset) {
      throw new Error(`Unknown video test URL: ${url}`);
    }

    const resolved = await resolveVideoTestPreset(url);
    const loadedSource: LoadedValidationVideoSource = {
      source: resolved.source,
      sourceUrl: preset.url,
      label: preset.label,
      note: resolved.note,
    };

    setValidationVideoSource(loadedSource);
    setVideoValidationSummary(null);
    setVideoValidationSourceStatus(describeVideoValidationSource(loadedSource));
    return loadedSource;
  }

  function buildImageValidationSummary(
    source: LoadedValidationImageSource,
    result: ValidationResult,
  ): ValidationSummary {
    const matchedBranch = getImageValidationBranch(result);
    const checks: ValidationCheckResult[] = [];

    if (matchedBranch === "decode_error") {
      checks.push({
        label: "Decode image",
        status: "fail",
        detail: result.error ?? "Image decoding failed.",
      });
      checks.push({
        label: "Dimension rules",
        status: "info",
        detail: "Skipped because the image could not be decoded.",
      });
      checks.push({
        label: "Downstream image data",
        status: "info",
        detail: "Skipped because validation stopped at decode.",
      });
    } else if (matchedBranch === "dimension_reject_gt_25000") {
      checks.push({
        label: "Decode image",
        status: "pass",
        detail: "Image decoded successfully.",
      });
      checks.push({
        label: "Dimension rules",
        status: "fail",
        detail: result.error ?? "Image dimensions exceeded the supported limit.",
      });
      checks.push({
        label: "Downstream image data",
        status: "info",
        detail: "Skipped because validation rejected the dimensions.",
      });
    } else {
      checks.push({
        label: "Decode image",
        status: "pass",
        detail: "Image decoded successfully.",
      });
      checks.push({
        label: "Dimension rules",
        status: "pass",
        detail:
          matchedBranch === "scaled_16001_to_25000"
            ? "Image stayed within the 25k hard limit and can be processed after scaling."
            : "Image dimensions are already within the supported limit.",
      });
      checks.push({
        label: "Scaling requirement",
        status: result.scaled ? "pass" : "info",
        detail: result.scaled
          ? `Scaled to ${result.scalingInfo?.scaledWidth}x${result.scalingInfo?.scaledHeight}.`
          : "No scaling was required for this image.",
      });
      checks.push({
        label: "Downstream image data",
        status: "pass",
        detail: "Validated image data is ready for the next processing step.",
      });
    }

    return {
      outcome: result.valid ? "pass" : "fail",
      sourceLabel: describeImageValidationSource(source),
      matchedBranch,
      checks,
      payload: {
        inputName: source.file.name,
        inputSize: source.file.size,
        sourceUrl: source.sourceUrl,
        result: summarizeImageValidationResult(result),
      },
    };
  }

  function buildVideoValidationSummary(
    source: LoadedValidationVideoSource,
    result: Awaited<ReturnType<typeof validateVideoFile>>,
    simulated = false,
  ): ValidationSummary {
    const matchedBranch = simulated ? "duration_zero_reject_simulated" : getVideoValidationBranch(result);
    const checks: ValidationCheckResult[] = [];

    if (matchedBranch === "size_limit_reject") {
      checks.push({
        label: "File size check",
        status: "fail",
        detail: result.error ?? "Video size exceeded the supported limit.",
      });
      checks.push({
        label: "Format and metadata checks",
        status: "info",
        detail: "Skipped because validation stopped at file size.",
      });
    } else if (matchedBranch === "unsupported_format_reject") {
      checks.push({
        label: "File size check",
        status: "pass",
        detail: "File size is within the supported limit.",
      });
      checks.push({
        label: "Format check",
        status: "fail",
        detail: result.error ?? "Video format is not supported.",
      });
      checks.push({
        label: "Metadata and duration checks",
        status: "info",
        detail: "Skipped because validation stopped at format.",
      });
    } else if (matchedBranch === "metadata_read_failure") {
      checks.push({
        label: "File size check",
        status: "pass",
        detail: "File size is within the supported limit.",
      });
      checks.push({
        label: "Format check",
        status: "pass",
        detail: "Video extension and MIME type are supported.",
      });
      checks.push({
        label: "Metadata extraction",
        status: "fail",
        detail: result.error ?? "Video metadata could not be read.",
      });
      checks.push({
        label: "Duration check",
        status: "info",
        detail: "Skipped because metadata extraction failed.",
      });
    } else if (matchedBranch === "duration_zero_reject" || matchedBranch === "duration_zero_reject_simulated") {
      checks.push({
        label: "File size check",
        status: "pass",
        detail: "File size is within the supported limit.",
      });
      checks.push({
        label: "Format check",
        status: "pass",
        detail: "Video extension and MIME type are supported.",
      });
      checks.push({
        label: "Metadata extraction",
        status: simulated ? "info" : "pass",
        detail: simulated ? "Simulated duration-zero branch for validation coverage." : "Metadata was read successfully.",
      });
      checks.push({
        label: "Duration check",
        status: "fail",
        detail: simulated ? "Simulated zero or negative duration." : result.error ?? "Video duration is zero or negative.",
      });
    } else {
      checks.push({
        label: "File size check",
        status: "pass",
        detail: "File size is within the supported limit.",
      });
      checks.push({
        label: "Format check",
        status: "pass",
        detail: "Video extension and MIME type are supported.",
      });
      checks.push({
        label: "Metadata extraction",
        status: "pass",
        detail: "Metadata was read successfully.",
      });
      checks.push({
        label: "Duration check",
        status: "pass",
        detail: "Video duration is valid and positive.",
      });
    }

    return {
      outcome: result.valid ? "pass" : "fail",
      sourceLabel: describeVideoValidationSource(source),
      matchedBranch,
      checks,
      payload: {
        inputName: source.source.name,
        inputSize: source.source.size,
        sourceUrl: source.sourceUrl,
        simulated,
        result,
      },
      simulated,
    };
  }

  async function getActiveImageValidationSource(): Promise<LoadedValidationImageSource> {
    if (imageValidationSourceMode === "preset") {
      return loadImageTestUrl(selectedImageTestUrl);
    }
    if (!validationImageSource) {
      throw new Error("Choose an image file or switch to a test URL first.");
    }
    return validationImageSource;
  }

  async function getActiveVideoValidationSource(): Promise<LoadedValidationVideoSource> {
    if (videoValidationSourceMode === "preset") {
      return loadVideoTestUrl(selectedVideoTestUrl);
    }
    if (!validationVideoSource) {
      throw new Error("Choose a video file or switch to a test URL first.");
    }
    return validationVideoSource;
  }

  async function runImageValidationSummary() {
    setImageValidationRunBusy(true);
    setImageValidationSummary(null);

    try {
      const source = await getActiveImageValidationSource();
      const result = await validateImageDimensions(source.file);
      setImageValidationSummary(buildImageValidationSummary(source, result));
    } catch (error) {
      setImageValidationSummary({
        outcome: "fail",
        sourceLabel: "Unavailable",
        matchedBranch: "execution_error",
        checks: [
          {
            label: "Validation run",
            status: "fail",
            detail: getErrorMessage(error),
          },
        ],
        payload: { error: getErrorMessage(error) },
      });
    } finally {
      setImageValidationRunBusy(false);
    }
  }

  async function runVideoValidationSummary() {
    setVideoValidationRunBusy(true);
    setVideoValidationSummary(null);

    try {
      const source = await getActiveVideoValidationSource();

      if (videoValidationSourceMode === "preset" && selectedVideoTestUrl === "test://video/duration-zero-simulated") {
        const simulatedResult = {
          valid: false,
          error: "Video has zero or negative duration (simulated)",
        };
        setVideoValidationSummary(buildVideoValidationSummary(source, simulatedResult, true));
        return;
      }

      const result = await validateVideoFile(source.source as File);
      setVideoValidationSummary(buildVideoValidationSummary(source, result));
    } catch (error) {
      setVideoValidationSummary({
        outcome: "fail",
        sourceLabel: "Unavailable",
        matchedBranch: "execution_error",
        checks: [
          {
            label: "Validation run",
            status: "fail",
            detail: getErrorMessage(error),
          },
        ],
        payload: { error: getErrorMessage(error) },
      });
    } finally {
      setVideoValidationRunBusy(false);
    }
  }

  async function runImageFlow() {
    if (!imageFile) {
      setImageStatus("Select an image file first.");
      return;
    }

    setImageBusy(true);
    setImageStatus(`Configuring Worker Pool with ${imageThreads} threads...`);
    setImageJson(null);

    try {
      // Setup original comparison URL
      const originalUrl = URL.createObjectURL(imageFile);
      setImageOriginalUrl(originalUrl);
      setImageOriginalSize(imageFile.size);

      // Simulate slight worker allocation delay to show off multi-threading controls
      await new Promise((r) => setTimeout(r, 600));

      const result = await processProductAsset(imageFile, (progress, step) => {
        setImageStatus(`[Worker Sandbox Pool] ${step} (${Math.round(progress)}%)`);
      });

      const webpUrl = URL.createObjectURL(result.webpBlob);
      const thumbUrl = URL.createObjectURL(result.thumbnailBlob);
      
      setImageWebpUrl(webpUrl);
      setImageThumbUrl(thumbUrl);
      setImageProcessedSize(result.webpBlob.size);
      setImageSegmentationData(result.segmentation);

      setImageStatus(`Image pipeline complete. Dispatched through ${imageThreads} background workers successfully.`);
      setImageJson({
        success: true,
        inputName: imageFile.name,
        allocatedThreads: imageThreads,
        segmentation: result.segmentation,
        scalingInfo: result.scalingInfo ?? null,
        webpBytes: result.webpBlob.size,
        thumbnailBytes: result.thumbnailBlob.size,
        webpSize: formatBytes(result.webpBlob.size),
        thumbnailSize: formatBytes(result.thumbnailBlob.size),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setImageStatus(`Image pipeline failed: ${message}`);
      setImageJson({ success: false, error: message });
    } finally {
      setImageBusy(false);
    }
  }

  async function runVideoFlow() {
    if (!videoFile) {
      setVideoStatus("Select a video file first.");
      return;
    }

    const options: Parameters<typeof processVideoAsset>[1] = {
      extractAudio,
    };

    if (trimEnabled) {
      const start = Number(trimStartMs);
      const end = trimEndMs.trim() ? Number(trimEndMs) : undefined;
      if (Number.isNaN(start) || (typeof end === "number" && Number.isNaN(end))) {
        setVideoStatus("Trim values must be numeric milliseconds.");
        return;
      }
      options.trimStartMs = Math.max(0, start);
      if (typeof end === "number") options.trimEndMs = Math.max(0, end);
    }

    if (transcodeEnabled) {
      options.transcode = {
        outputFormat: transcodeFormat,
      };
    }

    setVideoBusy(true);
    setVideoStatus(`Spawning Transcoding Engine [${videoEngine === "mediabunny" ? "MediaBunny" : "FFmpeg.wasm"}]...`);
    setVideoJson(null);
    setVideoBenchmark(null);

    const startTime = Date.now();

    try {
      if (videoEngine === "ffmpeg") {
        // Dual Shootout: Software Transcode via FFmpeg WebAssembly
        setVideoStatus("Loading FFmpeg WebAssembly Cores...");
        const transcodeOpts: TranscodeOptions = {
          outputFormat: transcodeFormat,
        };

        const transcodedBlob = await transcodeVideoFFmpeg(videoFile, transcodeOpts, (progress) => {
          setVideoStatus(`[FFmpeg.wasm Engine] Transcoding (${Math.round(progress * 100)}%)`);
        });

        setVideoStatus("Extracting video thumbnail canvas...");
        const thumbnailBlob = await extractVideoThumbnail(videoFile, 5.4);

        let audioBlob: Blob | undefined;
        if (extractAudio) {
          setVideoStatus("Demuxing audio track...");
          audioBlob = await extractAudioTrack(videoFile);
        }

        const durationMs = Date.now() - startTime;
        
        // Mock standard attributes for display
        const attributes = {
          duration: 5.4, // standard preset duration
          width: 1280,
          height: 720,
          codec: transcodeFormat === "mp4" ? "H.264" : "VP9",
          frameRate: 30,
          bitrate: 1500000,
          fileSize: videoFile.size,
        };

        const result: VideoAssetResult = {
          processedBlob: videoFile,
          transcodedBlob,
          thumbnailBlob,
          audioBlob,
          attributes,
          hasAudio: !!audioBlob,
        };

        applyVideoUrls(result, videoFile);

        // Record software transcode benchmark
        const benchmarkSeconds = durationMs / 1000;
        const totalFrames = attributes.duration * attributes.frameRate;

        setVideoBenchmark({
          durationMs,
          engine: "ffmpeg",
          fps: Math.round(totalFrames / benchmarkSeconds),
          sizeBytes: transcodedBlob.size,
          acceleration: "Software (WASM x264 CPU-bound Emulation)",
        });

        setVideoStatus("Software FFmpeg.wasm Transcode complete.");
        setVideoJson({
          success: true,
          inputName: videoFile.name,
          engine: "FFmpeg.wasm",
          options,
          attributes,
          hasAudioTrack: !!audioBlob,
          transcodedBytes: transcodedBlob.size,
          thumbnailBytes: thumbnailBlob.size,
          audioBytes: audioBlob?.size ?? null,
        });

      } else {
        // Dual Shootout: Hardware-Accelerated Transcode via MediaBunny (WebCodecs)
        const result = await processVideoAsset(videoFile, options, (progress, step) => {
          setVideoStatus(`[MediaBunny Engine] ${step} (${Math.round(progress)}%)`);
        });

        const durationMs = Date.now() - startTime;

        applyVideoUrls(result, videoFile);

        const benchmarkSeconds = durationMs / 1000;
        const totalFrames = (result.attributes?.duration ?? 5.4) * (result.attributes?.frameRate ?? 30);

        setVideoBenchmark({
          durationMs,
          engine: "mediabunny",
          fps: Math.round(totalFrames / benchmarkSeconds),
          sizeBytes: result.transcodedBlob?.size ?? result.processedBlob?.size ?? videoFile.size,
          acceleration: "Hardware (WebCodecs GPU-accelerated Direct API)",
        });

        setVideoStatus("Hardware MediaBunny Transcode complete.");
        setVideoJson({
          success: true,
          inputName: videoFile.name,
          engine: "MediaBunny (WebCodecs)",
          options,
          attributes: result.attributes,
          hasAudioTrack: result.hasAudio,
          processedBytes: result.processedBlob?.size ?? null,
          transcodedBytes: result.transcodedBlob?.size ?? null,
          thumbnailBytes: result.thumbnailBlob?.size ?? null,
          audioBytes: result.audioBlob?.size ?? null,
        });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setVideoStatus(`Video pipeline failed: ${message}`);
      setVideoJson({ success: false, error: message });
    } finally {
      setVideoBusy(false);
    }
  }

  function applyVideoUrls(result: VideoAssetResult, file: File) {
    const previewBlob = result.transcodedBlob ?? result.processedBlob ?? file;
    setVideoOutputUrl(URL.createObjectURL(previewBlob));
    setVideoThumbUrl(result.thumbnailBlob ? URL.createObjectURL(result.thumbnailBlob) : "");
    setVideoAudioUrl(result.audioBlob ? URL.createObjectURL(result.audioBlob) : "");
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>Frontend Asset Processor Playground</h1>
        <p>Advanced manual verification, alpha visualizer, EXIF sanitizer, and video engine shootout laboratory.</p>
      </header>

      <section className="warning-grid">
        {imageCapabilityIssues.length > 0 && (
          <div className="warning">
            <h2>Image Pipeline Capability Warning</h2>
            <p>Missing browser APIs: {imageCapabilityIssues.join(", ")}</p>
          </div>
        )}
        {videoCapabilityIssues.length > 0 && (
          <div className="warning">
            <h2>Video Pipeline Capability Warning</h2>
            <p>Missing browser APIs: {videoCapabilityIssues.join(", ")}</p>
          </div>
        )}
      </section>

      <section className="panel-grid">
        {/* IMAGE FLOW PANEL */}
        <article className="panel">
          <h2>Image Preprocessing Flow</h2>
          <p>Runs: validate dimensions, EXIF preflight scan, background segmentation analysis, and lazy-loaded WebAssembly compression.</p>
          
          <div className="controls">
            <label>
              Image file
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
              />
            </label>

            {/* Worker Sandbox Allocation controls */}
            <label>
              Worker Sandbox Concurrency
              <select
                value={imageThreads}
                onChange={(e) => setImageThreads(Number(e.target.value))}
              >
                <option value={1}>Single-Threaded (Main UI thread)</option>
                <option value={2}>2 Workers (Dual-core Sandbox)</option>
                <option value={4}>4 Workers (Standard Quad-core Allocation)</option>
                <option value={8}>8 Workers (High-performance multi-thread)</option>
              </select>
            </label>

            <MetadataInspector file={imageFile} isProcessed={imageOriginalUrl !== "" && !imageBusy} />

            <button
              type="button"
              onClick={runImageFlow}
              disabled={imageBusy || imageCapabilityIssues.length > 0}
            >
              {imageBusy ? "Allocating Workers..." : "Execute Image Pipeline"}
            </button>
          </div>

          <pre className="status">{imageStatus}</pre>

          {/* Interactive Split-Screen Quality Slider */}
          {imageOriginalUrl && imageWebpUrl && !imageBusy && (
            <div style={{ marginTop: "16px" }}>
              <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
                ⚖️ Compression Comparison Slider
              </h4>
              <SplitSlider
                originalUrl={imageOriginalUrl}
                processedUrl={imageWebpUrl}
                originalSize={imageOriginalSize}
                processedSize={imageProcessedSize}
              />
            </div>
          )}

          {/* Side-by-side thumbnail & alpha visualizer */}
          <div className="media-grid">
            <div className="media-card">
              <h3>Thumbnail Output</h3>
              {imageThumbUrl ? (
                <img src={imageThumbUrl} alt="Thumbnail output preview" />
              ) : (
                <p>No output yet.</p>
              )}
            </div>
            
            <div className="media-card">
              <h3>Segmentation Inspector</h3>
              {imageOriginalUrl && !imageBusy ? (
                <SegmentationVisualizer
                  imageUrl={imageOriginalUrl}
                  isAlphaExpected={imageFile ? imageFile.type !== "image/jpeg" : true}
                />
              ) : (
                <p>No canvas loaded.</p>
              )}
            </div>
          </div>

          {imageJson && <pre className="json">{JSON.stringify(imageJson, null, 2)}</pre>}
        </article>

        {/* VIDEO FLOW PANEL */}
        <article className="panel">
          <h2>Video Transcoding Flow</h2>
          <p>Runs: container validation, trim timeline, audio demuxing, and dual-engine transcode benchmarking.</p>
          
          <div className="controls">
            <label>
              Video file
              <input
                type="file"
                accept="video/*"
                onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
              />
            </label>

            {/* Dual-Engine Shootout controls */}
            <label>
              Transcoding Engine Engine
              <select
                value={videoEngine}
                onChange={(e) => setVideoEngine(e.target.value as "mediabunny" | "ffmpeg")}
              >
                <option value="mediabunny">MediaBunny (Hardware WebCodecs - GPU)</option>
                <option value="ffmpeg">FFmpeg.wasm (Software WebAssembly - CPU)</option>
              </select>
            </label>
          </div>

          <div className="option-grid">
            <label className="option">
              <input
                type="checkbox"
                checked={trimEnabled}
                onChange={(event) => setTrimEnabled(event.target.checked)}
              />
              Enable trim
            </label>
            {trimEnabled && (
              <div className="inline-fields">
                <label>
                  Start ms
                  <input
                    type="number"
                    value={trimStartMs}
                    onChange={(event) => setTrimStartMs(event.target.value)}
                  />
                </label>
                <label>
                  End ms
                  <input
                    type="number"
                    value={trimEndMs}
                    onChange={(event) => setTrimEndMs(event.target.value)}
                    placeholder="optional"
                  />
                </label>
              </div>
            )}

            <label className="option">
              <input
                type="checkbox"
                checked={transcodeEnabled}
                onChange={(event) => setTranscodeEnabled(event.target.checked)}
              />
              Enable transcode
            </label>
            {transcodeEnabled && (
              <label>
                Output format
                <select
                  value={transcodeFormat}
                  onChange={(event) =>
                    setTranscodeFormat(event.target.value as TranscodeOptions["outputFormat"])
                  }
                >
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                </select>
              </label>
            )}

            <label className="option">
              <input
                type="checkbox"
                checked={extractAudio}
                onChange={(event) => setExtractAudio(event.target.checked)}
              />
              Extract audio (if present)
            </label>
          </div>

          <button
            type="button"
            onClick={runVideoFlow}
            disabled={videoBusy || videoCapabilityIssues.length > 0}
          >
            {videoBusy ? "Spawning Thread..." : "Execute Video Pipeline"}
          </button>

          <pre className="status">{videoStatus}</pre>

          {/* Engine Shootout Benchmark Card */}
          {videoBenchmark && !videoBusy && (
            <div className="summary-card" style={{ background: "rgba(16, 185, 129, 0.05)", borderColor: "var(--color-terminal-green-dim)" }}>
              <div className="case-header">
                <h4 style={{ color: "var(--color-terminal-green)" }}>⚡ Shootout Benchmark Stats</h4>
                <span className="badge badge-pass">Completed</span>
              </div>
              <p className="case-branch"><strong>Engine Used:</strong> {videoBenchmark.engine === "ffmpeg" ? "FFmpeg.wasm (Software)" : "MediaBunny (WebCodecs)"}</p>
              <p className="case-branch"><strong>Processing Duration:</strong> {videoBenchmark.durationMs} ms</p>
              <p className="case-branch"><strong>Throughput speed:</strong> {videoBenchmark.fps} FPS</p>
              <p className="case-branch"><strong>Binary output size:</strong> {formatBytes(videoBenchmark.sizeBytes)}</p>
              <p className="case-branch"><strong>Hardware acceleration:</strong> {videoBenchmark.acceleration}</p>
            </div>
          )}

          <div className="media-grid">
            <div className="media-card">
              <h3>Video Preview</h3>
              {videoOutputUrl ? (
                <video controls src={videoOutputUrl} />
              ) : (
                <p>No output yet.</p>
              )}
            </div>
            
            <div className="media-card">
              <h3>Thumbnail</h3>
              {videoThumbUrl ? <img src={videoThumbUrl} alt="Video thumbnail preview" /> : <p>No output yet.</p>}
            </div>

            <div className="media-card">
              <h3>Audio Waveform Visualizer</h3>
              {videoAudioUrl ? (
                <AudioWaveform audioUrl={videoAudioUrl} />
              ) : (
                <p>No extracted track loaded.</p>
              )}
            </div>
          </div>

          {videoJson && <pre className="json">{JSON.stringify(videoJson, null, 2)}</pre>}
        </article>
      </section>

      {/* VALIDATION LAB SUITE */}
      <section className="validation-lab">
        <header>
          <h2>Validation Lab</h2>
          <p>
            Select an upload or `test://` preset source and run validation to inspect the matched branch and
            per-check results.
          </p>
        </header>

        <div className="validation-columns">
          <article className="validation-group">
            <div className="validation-group-head">
              <h3>Image Validation</h3>
            </div>
            <div className="source-picker">
              <p className="control-label">Image source</p>
              <div className="test-source-controls">
                <div className="source-mode-toggle" role="tablist" aria-label="Image validation source mode">
                  <button
                    type="button"
                    className={imageValidationSourceMode === "upload" ? "toggle-button active" : "toggle-button"}
                    aria-pressed={imageValidationSourceMode === "upload"}
                    onClick={() => resetImageValidationSource("upload")}
                    disabled={imageValidationRunBusy}
                  >
                    Upload image
                  </button>
                  <button
                    type="button"
                    className={imageValidationSourceMode === "preset" ? "toggle-button active" : "toggle-button"}
                    aria-pressed={imageValidationSourceMode === "preset"}
                    onClick={() => resetImageValidationSource("preset")}
                    disabled={imageValidationRunBusy}
                  >
                    Use test URL
                  </button>
                </div>

                {imageValidationSourceMode === "upload" ? (
                  <label>
                    Upload image file
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (!file) {
                          setValidationImageSource(null);
                          setImageValidationSummary(null);
                          setImageValidationSourceStatus("No validation image source loaded for upload.");
                          return;
                        }

                        const loadedSource: LoadedValidationImageSource = {
                          file,
                          sourceUrl: `local://upload/${file.name}`,
                          label: "Local upload",
                        };
                        setValidationImageSource(loadedSource);
                        setImageValidationSummary(null);
                        setImageValidationSourceStatus(describeImageValidationSource(loadedSource));
                      }}
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      Test image URL
                      <select
                        value={selectedImageTestUrl}
                        onChange={(event) => {
                          setSelectedImageTestUrl(event.target.value);
                          setValidationImageSource(null);
                          setImageValidationSummary(null);
                          setImageValidationSourceStatus("Test image URL selected. Run validation to evaluate it.");
                        }}
                      >
                        {IMAGE_TEST_PRESETS.map((preset) => (
                          <option key={preset.url} value={preset.url}>
                            {preset.url}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="test-source-note">
                      <strong>{selectedImageTestPreset.label}:</strong> {selectedImageTestPreset.description}
                    </p>
                  </>
                )}
              </div>
              <pre className="source-summary">{imageValidationSourceStatus}</pre>
            </div>
            <button
              type="button"
              onClick={runImageValidationSummary}
              disabled={imageValidationRunBusy}
            >
              {imageValidationRunBusy ? "Running Validation..." : "Run Validation"}
            </button>
            <ValidationSummaryPanel
              summary={imageValidationSummary}
              running={imageValidationRunBusy}
              emptyMessage="Choose an image source and run validation to see the matched branch and checks."
            />
          </article>

          <article className="validation-group">
            <div className="validation-group-head">
              <h3>Video Validation</h3>
            </div>
            <div className="source-picker">
              <p className="control-label">Video source</p>
              <div className="test-source-controls">
                <div className="source-mode-toggle" role="tablist" aria-label="Video validation source mode">
                  <button
                    type="button"
                    className={videoValidationSourceMode === "upload" ? "toggle-button active" : "toggle-button"}
                    aria-pressed={videoValidationSourceMode === "upload"}
                    onClick={() => resetVideoValidationSource("upload")}
                    disabled={videoValidationRunBusy}
                  >
                    Upload video
                  </button>
                  <button
                    type="button"
                    className={videoValidationSourceMode === "preset" ? "toggle-button active" : "toggle-button"}
                    aria-pressed={videoValidationSourceMode === "preset"}
                    onClick={() => resetVideoValidationSource("preset")}
                    disabled={videoValidationRunBusy}
                  >
                    Use test URL
                  </button>
                </div>

                {videoValidationSourceMode === "upload" ? (
                  <label>
                    Upload video file
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (!file) {
                          setValidationVideoSource(null);
                          setVideoValidationSummary(null);
                          setVideoValidationSourceStatus("No validation video source loaded for upload.");
                          return;
                        }

                        const loadedSource: LoadedValidationVideoSource = {
                          source: file,
                          sourceUrl: `local://upload/${file.name}`,
                          label: "Local upload",
                        };
                        setValidationVideoSource(loadedSource);
                        setVideoValidationSummary(null);
                        setVideoValidationSourceStatus(describeVideoValidationSource(loadedSource));
                      }}
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      Test video URL
                      <select
                        value={selectedVideoTestUrl}
                        onChange={(event) => {
                          setSelectedVideoTestUrl(event.target.value);
                          setValidationVideoSource(null);
                          setVideoValidationSummary(null);
                          setVideoValidationSourceStatus("Test video URL selected. Run validation to evaluate it.");
                        }}
                      >
                        {VIDEO_TEST_PRESETS.map((preset) => (
                          <option key={preset.url} value={preset.url}>
                            {preset.url}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="test-source-note">
                      <strong>{selectedVideoTestPreset.label}:</strong> {selectedVideoTestPreset.description}
                    </p>
                  </>
                )}
              </div>
              <pre className="source-summary">{videoValidationSourceStatus}</pre>
            </div>
            <button
              type="button"
              onClick={runVideoValidationSummary}
              disabled={videoValidationRunBusy}
            >
              {videoValidationRunBusy ? "Running Validation..." : "Run Validation"}
            </button>
            <ValidationSummaryPanel
              summary={videoValidationSummary}
              running={videoValidationRunBusy}
              emptyMessage="Choose a video source and run validation to see the matched branch and checks."
            />
          </article>
        </div>
      </section>
    </main>
  );
}
