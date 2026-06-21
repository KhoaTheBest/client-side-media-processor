import React, { useEffect, useRef, useState } from "react";

interface SegmentationVisualizerProps {
  imageUrl: string;
  isAlphaExpected?: boolean;
}

export function SegmentationVisualizer({
  imageUrl,
  isAlphaExpected = true,
}: SegmentationVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<"standard" | "heatmap" | "contour">("standard");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setLoading(true);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!active) return;
      
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      // Target viewport canvas size
      const maxDisplayDim = 200;
      let w = width;
      let h = height;

      if (Math.max(width, height) > maxDisplayDim) {
        const factor = maxDisplayDim / Math.max(width, height);
        w = Math.round(width * factor);
        h = Math.round(height * factor);
      }

      canvas.width = w;
      canvas.height = h;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      if (mode === "heatmap") {
        // Compute alpha heatmap
        try {
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;

          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha < 255) {
              // Neon visual check: highlight transparent or translucent pixels in hot magenta/pink
              data[i] = 236;     // Red
              data[i + 1] = 72;  // Green
              data[i + 2] = 153; // Blue
              data[i + 3] = 180; // High transparency overlay
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (e) {
          console.error("Canvas pixel read blocked (cross-origin or local issue):", e);
        }
      } else if (mode === "contour") {
        // Trace contours around transparent border edges
        try {
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;
          
          ctx.drawImage(img, 0, 0, w, h);
          ctx.strokeStyle = "#10b981"; // Glowing green contour line
          ctx.lineWidth = 2.5;
          ctx.shadowColor = "#34d399";
          ctx.shadowBlur = 6;

          // Simple edge border trace where alpha changes
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const idx = (y * w + x) * 4;
              const alpha = data[idx + 3];
              
              // If current pixel is opaque, check neighbors for transparency
              if (alpha > 0) {
                const lIdx = (y * w + (x - 1)) * 4;
                const rIdx = (y * w + (x + 1)) * 4;
                const uIdx = ((y - 1) * w + x) * 4;
                const dIdx = ((y + 1) * w + x) * 4;

                if (data[lIdx + 3] === 0 || data[rIdx + 3] === 0 || data[uIdx + 3] === 0 || data[dIdx + 3] === 0) {
                  ctx.fillStyle = "#10b981";
                  ctx.fillRect(x, y, 1.5, 1.5);
                }
              }
            }
          }
        } catch (e) {
          console.error("Contour analysis blocked:", e);
        }
      }

      setLoading(false);
    };

    img.src = imageUrl;

    return () => {
      active = false;
    };
  }, [imageUrl, mode]);

  return (
    <div className="segmentation-visualizer">
      <div className="visualizer-screen">
        <canvas ref={canvasRef} className="visualizer-canvas" />
        {loading && <div className="visualizer-loader">Scanning...</div>}
      </div>

      <div className="visualizer-tabs">
        <button
          type="button"
          onClick={() => setMode("standard")}
          className={mode === "standard" ? "vis-tab-btn active" : "vis-tab-btn"}
        >
          Raw Pixels
        </button>
        <button
          type="button"
          onClick={() => setMode("heatmap")}
          className={mode === "heatmap" ? "vis-tab-btn active" : "vis-tab-btn"}
          disabled={!isAlphaExpected}
        >
          Alpha Heatmap
        </button>
        <button
          type="button"
          onClick={() => setMode("contour")}
          className={mode === "contour" ? "vis-tab-btn active" : "vis-tab-btn"}
          disabled={!isAlphaExpected}
        >
          Trace Contour
        </button>
      </div>
    </div>
  );
}
