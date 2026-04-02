import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateImageDimensions } from "../lib/image-validation";
import { CONFIG } from "../types";

describe("validateImageDimensions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should accept images within dimension limits", async () => {
    // Mock createImageBitmap to return a 1920x1080 image
    vi.mocked(globalThis.createImageBitmap).mockResolvedValueOnce({
      width: 1920,
      height: 1080,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    const file = new File(["test"], "photo.jpg", { type: "image/jpeg" });
    const result = await validateImageDimensions(file);

    expect(result.valid).toBe(true);
    expect(result.scaled).toBe(false);
    expect(result.imageData).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("should reject images exceeding 25k pixel limit", async () => {
    vi.mocked(globalThis.createImageBitmap).mockResolvedValueOnce({
      width: 30000,
      height: 20000,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    const file = new File(["test"], "huge.jpg", { type: "image/jpeg" });
    const result = await validateImageDimensions(file);

    expect(result.valid).toBe(false);
    expect(result.scaled).toBe(false);
    expect(result.error).toContain("30000x20000");
    expect(result.error).toContain(`${CONFIG.VALID_IMAGE_DIMENSION_LIMIT}`);
  });

  it("should scale down images in the 16k–25k range", async () => {
    vi.mocked(globalThis.createImageBitmap).mockResolvedValueOnce({
      width: 20000,
      height: 15000,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    const file = new File(["test"], "large.jpg", { type: "image/jpeg" });
    const result = await validateImageDimensions(file);

    expect(result.valid).toBe(true);
    expect(result.scaled).toBe(true);
    expect(result.scalingInfo).toBeDefined();
    expect(result.scalingInfo!.originalWidth).toBe(20000);
    expect(result.scalingInfo!.originalHeight).toBe(15000);
    expect(result.scalingInfo!.scalingFactor).toBeCloseTo(
      CONFIG.ORIGINAL_IMAGE_DIMENSION_LIMIT / 20000,
    );
  });

  it("should return error for corrupt/unreadable files", async () => {
    vi.mocked(globalThis.createImageBitmap).mockRejectedValueOnce(
      new Error("Invalid image"),
    );

    const file = new File(["not-an-image"], "corrupt.xyz", { type: "application/octet-stream" });
    const result = await validateImageDimensions(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Failed to decode");
  });

  it("should handle exact boundary at 16k pixels without scaling", async () => {
    vi.mocked(globalThis.createImageBitmap).mockResolvedValueOnce({
      width: 16000,
      height: 12000,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    const file = new File(["test"], "boundary.jpg", { type: "image/jpeg" });
    const result = await validateImageDimensions(file);

    expect(result.valid).toBe(true);
    expect(result.scaled).toBe(false);
  });

  it("should handle exact boundary at 25k pixels with rejection", async () => {
    vi.mocked(globalThis.createImageBitmap).mockResolvedValueOnce({
      width: 25001,
      height: 10000,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    const file = new File(["test"], "boundary25k.jpg", { type: "image/jpeg" });
    const result = await validateImageDimensions(file);

    expect(result.valid).toBe(false);
  });
});
