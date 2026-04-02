export const IMAGE_VALIDATION_LIMIT = 25_000;
export const IMAGE_ORIGINAL_LIMIT = 16_000;
export const VIDEO_MAX_SIZE_MB = 500;

export interface ImageTestPreset {
  url: string;
  label: string;
  description: string;
  recommendedCase: string;
}

export interface VideoTestPreset {
  url: string;
  label: string;
  description: string;
  recommendedCase: string;
}

export interface ValidationFileStub {
  name: string;
  type: string;
  size: number;
}

export interface ResolvedVideoTestPreset {
  source: File | ValidationFileStub;
  simulateDurationZero?: boolean;
  note?: string;
}

export const IMAGE_TEST_PRESETS: ImageTestPreset[] = [
  {
    url: "test://image/real-upload-valid",
    label: "Valid upload image",
    description: "Synthetic 1200x800 PNG that decodes cleanly and stays within limits.",
    recommendedCase: "image-real-upload",
  },
  {
    url: "test://image/decode-failure",
    label: "Decode failure image",
    description: "Broken PNG payload for the decode-failure validation branch.",
    recommendedCase: "image-decode-failure",
  },
  {
    url: "test://image/within-limit",
    label: "Within-limit image",
    description: "Synthetic image that stays below the 16k original-dimension limit.",
    recommendedCase: "image-within-limit",
  },
  {
    url: "test://image/scale-branch",
    label: "Scale-branch image",
    description: "Synthetic 17,001px-wide image that triggers validation scaling.",
    recommendedCase: "image-scale-branch",
  },
  {
    url: "test://image/reject-branch",
    label: "Reject-branch image",
    description: "Synthetic 25,001px-wide image that exceeds the validation limit.",
    recommendedCase: "image-reject-branch",
  },
  {
    url: "test://image/webp-guard",
    label: "WebP guard image",
    description: "Synthetic large image sized to trip the direct WebP dimension guard.",
    recommendedCase: "image-webp-guard",
  },
];

export const VIDEO_TEST_PRESETS: VideoTestPreset[] = [
  {
    url: "test://video/real-upload-valid",
    label: "Valid upload video",
    description: "Generated WebM clip with readable metadata for the valid-video branch.",
    recommendedCase: "video-real-upload",
  },
  {
    url: "test://video/oversize",
    label: "Oversize video",
    description: "Validation stub that reports a size above the 500MB limit.",
    recommendedCase: "video-oversize",
  },
  {
    url: "test://video/unsupported-format",
    label: "Unsupported-format file",
    description: "Plain-text file that trips the unsupported-format validation branch.",
    recommendedCase: "video-unsupported-format",
  },
  {
    url: "test://video/metadata-failure",
    label: "Metadata-failure video",
    description: "Malformed MP4 payload that reaches metadata extraction and fails there.",
    recommendedCase: "video-metadata-failure",
  },
  {
    url: "test://video/duration-zero-simulated",
    label: "Duration-zero simulation",
    description: "Enables the simulated zero-duration case without requiring a broken real asset.",
    recommendedCase: "video-duration-zero-simulated",
  },
];

export async function resolveImageTestPreset(url: string): Promise<File> {
  switch (url) {
    case "test://image/real-upload-valid":
      return createSyntheticImageFile(1200, 800, "validation-real-upload.png");
    case "test://image/decode-failure":
      return new File([new Blob(["not-an-image-content"])], "decode-failure.png", {
        type: "image/png",
      });
    case "test://image/within-limit":
      return createSyntheticImageFile(1200, 800, "within-limit.png");
    case "test://image/scale-branch":
      return createSyntheticImageFile(IMAGE_ORIGINAL_LIMIT + 1001, 8, "scale-branch.png");
    case "test://image/reject-branch":
      return createSyntheticImageFile(IMAGE_VALIDATION_LIMIT + 1, 8, "reject-branch.png");
    case "test://image/webp-guard":
      return createSyntheticImageFile(IMAGE_ORIGINAL_LIMIT + 1001, 8, "webp-guard.png");
    default:
      throw new Error(`Unknown image test URL: ${url}`);
  }
}

export async function resolveVideoTestPreset(url: string): Promise<ResolvedVideoTestPreset> {
  switch (url) {
    case "test://video/real-upload-valid":
      return {
        source: await createSyntheticVideoFile("validation-real-upload.webm"),
      };
    case "test://video/oversize":
      return {
        source: {
          name: "oversized.mp4",
          type: "video/mp4",
          size: (VIDEO_MAX_SIZE_MB + 1) * 1024 * 1024,
        },
      };
    case "test://video/unsupported-format":
      return {
        source: new File([new Blob(["plain text"])], "notes.txt", {
          type: "text/plain",
        }),
      };
    case "test://video/metadata-failure":
      return {
        source: new File([new Blob(["not a real video stream"])], "broken.mp4", {
          type: "video/mp4",
        }),
      };
    case "test://video/duration-zero-simulated":
      return {
        source: await createSyntheticVideoFile("duration-zero-simulated.webm"),
        simulateDurationZero: true,
        note: "Recommended for the simulated duration-zero case.",
      };
    default:
      throw new Error(`Unknown video test URL: ${url}`);
  }
}

export function isValidationFileStub(source: File | ValidationFileStub): source is ValidationFileStub {
  return !(source instanceof File);
}

export async function createSyntheticImageFile(
  width: number,
  height: number,
  name: string,
): Promise<File> {
  if (typeof OffscreenCanvas !== "function") {
    throw new Error("OffscreenCanvas is required for synthetic image validation cases.");
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context for synthetic image generation.");
  }

  const gradient = ctx.createLinearGradient(0, 0, width, height || 1);
  gradient.addColorStop(0, "#0f766e");
  gradient.addColorStop(1, "#f59e0b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const stripeWidth = Math.max(1, Math.floor(width / 24));
  for (let x = 0; x < width; x += stripeWidth * 2) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.fillRect(x, 0, stripeWidth, height);
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new File([blob], name, { type: "image/png" });
}

async function createSyntheticVideoFile(name: string): Promise<File> {
  if (typeof document === "undefined") {
    throw new Error("Document is required for synthetic video generation.");
  }
  if (typeof MediaRecorder !== "function") {
    throw new Error("MediaRecorder is required for synthetic video test URLs.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;

  if (typeof canvas.captureStream !== "function") {
    throw new Error("HTMLCanvasElement.captureStream is required for synthetic video test URLs.");
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context for synthetic video generation.");
  }

  const stream = canvas.captureStream(12);
  const mimeType = pickSupportedMimeType([
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]);
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];

  const stopPromise = new Promise<void>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => reject(new Error("Synthetic video recording failed."));
    recorder.onstop = () => resolve();
  });

  recorder.start(150);
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const drawFrame = (timestamp: number) => {
      const elapsed = timestamp - startedAt;
      const progress = Math.min(elapsed / 1200, 1);

      ctx.fillStyle = "#08111f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#0f766e";
      ctx.fillRect(16, 16, canvas.width - 32, canvas.height - 32);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "600 22px Avenir Next";
      ctx.fillText("Frontend Asset Processor", 24, 58);

      ctx.fillStyle = "#fde68a";
      ctx.fillRect(24, 96, Math.max(14, Math.round((canvas.width - 48) * progress)), 18);

      ctx.fillStyle = "#dbeafe";
      ctx.font = "500 16px Avenir Next";
      ctx.fillText(`Synthetic validation clip ${(progress * 100).toFixed(0)}%`, 24, 140);

      if (progress < 1) {
        requestAnimationFrame(drawFrame);
        return;
      }

      resolve();
    };

    requestAnimationFrame(drawFrame);
  });

  recorder.stop();
  await stopPromise;
  stream.getTracks().forEach((track) => track.stop());

  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
  return new File([blob], name, { type: blob.type });
}

function pickSupportedMimeType(mimeTypes: string[]): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return mimeTypes[0];
  }

  return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}
