import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jSquash modules
vi.mock("@jsquash/webp", () => ({
  encode: vi.fn(async () => new Uint8Array(500)),
}));

vi.mock("@jsquash/resize", () => ({
  default: vi.fn(async (_data: ImageData, opts: { width: number; height: number }) => {
    return new ImageData(opts.width, opts.height);
  }),
}));

import { generateThumbnail } from "../lib/thumbnail-generation";
import { CONFIG } from "../types";

describe("generateThumbnail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should generate a thumbnail within max dimensions", async () => {
    const imageData = new ImageData(1920, 1080);
    const result = await generateThumbnail(imageData);

    expect(result.thumbnailBlob).toBeInstanceOf(Blob);
    expect(result.thumbnailBlob.type).toBe("image/webp");

    // Should fit within 300x300 while preserving aspect ratio
    expect(result.width).toBeLessThanOrEqual(CONFIG.THUMBNAIL_MAX_WIDTH);
    expect(result.height).toBeLessThanOrEqual(CONFIG.THUMBNAIL_MAX_HEIGHT);
  });

  it("should preserve aspect ratio (landscape)", async () => {
    const imageData = new ImageData(1920, 1080);
    const result = await generateThumbnail(imageData);

    const expectedRatio = 1920 / 1080;
    const actualRatio = result.width / result.height;
    expect(actualRatio).toBeCloseTo(expectedRatio, 0);
  });

  it("should preserve aspect ratio (portrait)", async () => {
    const imageData = new ImageData(1080, 1920);
    const result = await generateThumbnail(imageData);

    const expectedRatio = 1080 / 1920;
    const actualRatio = result.width / result.height;
    expect(actualRatio).toBeCloseTo(expectedRatio, 0);
  });

  it("should not upscale small images", async () => {
    const imageData = new ImageData(100, 80);
    const result = await generateThumbnail(imageData);

    // Should stay at original size since it's smaller than thumbnail max
    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
  });

  it("should accept custom max dimensions", async () => {
    const imageData = new ImageData(2000, 2000);
    const result = await generateThumbnail(imageData, {
      maxWidth: 150,
      maxHeight: 150,
    });

    expect(result.width).toBeLessThanOrEqual(150);
    expect(result.height).toBeLessThanOrEqual(150);
  });
});
