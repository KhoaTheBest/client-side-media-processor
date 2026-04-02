/**
 * Vitest setup file — polyfills browser APIs for the jsdom environment.
 *
 * jsdom doesn't provide OffscreenCanvas, createImageBitmap, or ImageData natively,
 * so we mock them for unit testing.
 */

import { vi } from "vitest";

// ── Mock ImageData ──────────────────────────────────
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as Record<string, unknown>).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: string;

    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      heightOrUndefined?: number,
    ) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = heightOrUndefined ?? dataOrWidth.length / (4 * widthOrHeight);
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
      this.colorSpace = "srgb";
    }
  };
}

// ── Mock OffscreenCanvas ────────────────────────────
class MockOffscreenCanvas {
  width: number;
  height: number;
  private _imageData: ImageData | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(_type: string) {
    const self = this;
    return {
      drawImage(_source: unknown, _x: number, _y: number, w?: number, h?: number) {
        // When drawImage is called, create an ImageData with the canvas dimensions
        const width = w ?? self.width;
        const height = h ?? self.height;
        self._imageData = new ImageData(width, height);
      },
      getImageData(x: number, y: number, w: number, h: number) {
        if (self._imageData && self._imageData.width === w && self._imageData.height === h) {
          return self._imageData;
        }
        return new ImageData(w, h);
      },
    };
  }

  convertToBlob(options?: { type?: string; quality?: number }) {
    return Promise.resolve(
      new Blob([new Uint8Array(100)], { type: options?.type ?? "image/png" }),
    );
  }
}

if (typeof globalThis.OffscreenCanvas === "undefined") {
  (globalThis as Record<string, unknown>).OffscreenCanvas = MockOffscreenCanvas;
}

// ── Mock createImageBitmap ──────────────────────────
// ── Mock URL.createObjectURL / revokeObjectURL ──
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = vi.fn();
}

// ── Mock createImageBitmap ──────────────────────────
if (typeof globalThis.createImageBitmap === "undefined") {
  (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(
    async (source: Blob | ImageData) => {
      let width = 100;
      let height = 100;

      if (source instanceof ImageData) {
        width = source.width;
        height = source.height;
      } else if (source instanceof Blob) {
        // Default test size — tests can override via vi.mocked()
        width = 1920;
        height = 1080;
      }

      return {
        width,
        height,
        close: vi.fn(),
      };
    },
  );
}
