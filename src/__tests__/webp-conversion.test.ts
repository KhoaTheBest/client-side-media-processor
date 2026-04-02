import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jSquash modules before importing the module under test
vi.mock("@jsquash/webp", () => ({
  encode: vi.fn(async (imageData: ImageData) => {
    // Return a fake WebP buffer proportional to image size
    return new Uint8Array(Math.floor(imageData.width * imageData.height * 0.1));
  }),
}));

vi.mock("@jsquash/resize", () => ({
  default: vi.fn(async (imageData: ImageData, opts: { width: number; height: number }) => {
    return new ImageData(opts.width, opts.height);
  }),
}));

vi.mock("@jsquash/png", () => ({
  decode: vi.fn(async () => new ImageData(1920, 1080)),
}));

vi.mock("@jsquash/jpeg", () => ({
  decode: vi.fn(async () => new ImageData(1920, 1080)),
}));

import { convertToWebP } from "../lib/webp-conversion";
import { CONFIG } from "../types";

describe("convertToWebP", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should convert ImageData to a WebP blob", async () => {
    const imageData = new ImageData(800, 600);
    const file = new File(["test"], "photo.png", { type: "image/png" });

    const result = await convertToWebP(file, imageData, { enableScaling: false });

    expect(result.webpBlob).toBeInstanceOf(Blob);
    expect(result.webpBlob.type).toBe("image/webp");
    expect(result.scalingInfo).toBeUndefined();
  });

  it("should scale down when image exceeds SCALED_IMAGE_DIMENSION_LIMIT", async () => {
    const imageData = new ImageData(8000, 6000);
    const file = new File(["test"], "big.png", { type: "image/png" });

    const result = await convertToWebP(file, imageData, {
      enableScaling: true,
      scaledDimensionLimit: CONFIG.SCALED_IMAGE_DIMENSION_LIMIT,
    });

    expect(result.scalingInfo).toBeDefined();
    expect(result.scalingInfo!.originalWidth).toBe(8000);
    expect(result.scalingInfo!.originalHeight).toBe(6000);
    expect(result.scalingInfo!.scalingFactor).toBeCloseTo(
      CONFIG.SCALED_IMAGE_DIMENSION_LIMIT / 8000,
    );
  });

  it("should throw when image exceeds WebP dimension limit", async () => {
    const imageData = new ImageData(20000, 10000);
    const file = new File(["test"], "huge.png", { type: "image/png" });

    await expect(
      convertToWebP(file, imageData, { enableScaling: false }),
    ).rejects.toThrow("exceed WebP limit");
  });

  it("should not scale when dimensions are within limits", async () => {
    const imageData = new ImageData(2000, 1500);
    const file = new File(["test"], "normal.png", { type: "image/png" });

    const result = await convertToWebP(file, imageData, { enableScaling: true });

    expect(result.scalingInfo).toBeUndefined();
  });
});
