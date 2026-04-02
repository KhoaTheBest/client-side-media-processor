import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock mediabunny with the correct API shape
vi.mock("mediabunny", () => {
  const mockInput = {
    getPrimaryVideoTrack: vi.fn().mockResolvedValue({
      codec: "avc",
      displayWidth: 1920,
      displayHeight: 1080,
      computePacketStats: vi.fn().mockResolvedValue({
        packetCount: 900,
        averagePacketRate: 30,
        averageBitrate: 5_000_000,
      }),
    }),
    getPrimaryAudioTrack: vi.fn().mockResolvedValue({
      codec: "aac",
      sampleRate: 44100,
    }),
    dispose: vi.fn(),
  };

  return {
    Input: vi.fn().mockImplementation(() => mockInput),
    BlobSource: vi.fn().mockImplementation(() => ({})),
    ALL_FORMATS: [],
  };
});

import { validateVideoFile } from "../lib/video-metadata";

describe("validateVideoFile", () => {
  beforeEach(() => {
    // Mock HTML5 video element for getHTML5VideoMetadata
    const mockVideo: Record<string, unknown> = {
      preload: "",
      src: "",
      duration: 30.5,
      videoWidth: 1920,
      videoHeight: 1080,
      onloadedmetadata: null,
      onerror: null,
    };

    // When src is set, schedule the onloadedmetadata callback
    Object.defineProperty(mockVideo, "src", {
      set() {
        setTimeout(() => {
          const fn = mockVideo.onloadedmetadata as (() => void) | null;
          if (fn) fn();
        }, 0);
      },
      get() {
        return "";
      },
    });

    vi.spyOn(document, "createElement").mockReturnValue(mockVideo as unknown as HTMLElement);
  });

  it("should reject files exceeding max size", async () => {
    const largeFile = new File(["x".repeat(100)], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(largeFile, "size", { value: 600 * 1024 * 1024 }); // 600MB

    const result = await validateVideoFile(largeFile, 500);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum");
  });

  it("should reject unsupported formats", async () => {
    const file = new File(["test"], "video.avi", { type: "video/x-msvideo" });

    const result = await validateVideoFile(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported video format");
  });

  it("should accept valid MP4 files", async () => {
    const file = new File(["test"], "video.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 50 * 1024 * 1024 }); // 50MB

    const result = await validateVideoFile(file);

    expect(result.valid).toBe(true);
    expect(result.attributes).toBeDefined();
    expect(result.attributes!.codec).toBe("avc");
    expect(result.attributes!.fileSize).toBe(50 * 1024 * 1024);
    expect(result.attributes!.duration).toBe(30.5);
    expect(result.attributes!.width).toBe(1920);
    expect(result.attributes!.height).toBe(1080);
  });
});
