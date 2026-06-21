import React, { useState } from "react";

interface SplitSliderProps {
  originalUrl: string;
  processedUrl: string;
  originalSize: number;
  processedSize: number;
  width?: number;
  height?: number;
}

export function SplitSlider({
  originalUrl,
  processedUrl,
  originalSize,
  processedSize,
}: SplitSliderProps) {
  const [sliderPos, setSliderPos] = useState(50);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  };

  const reduction = ((originalSize - processedSize) / originalSize * 100).toFixed(1);

  return (
    <div className="slider-wrapper">
      <div className="slider-meta">
        <span className="meta-orig">Original: {formatBytes(originalSize)}</span>
        <span className="meta-reduct">⚡ -{reduction}% Compression</span>
        <span className="meta-proc">WebP: {formatBytes(processedSize)}</span>
      </div>

      <div className="slider-container">
        {/* Original (Left Background) */}
        <div className="slider-layer layer-original">
          <img src={originalUrl} alt="Original" />
          <span className="layer-label label-left">Original</span>
        </div>

        {/* Processed (Right Foreground with clip-path) */}
        <div
          className="slider-layer layer-processed"
          style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
        >
          <img src={processedUrl} alt="Processed WebP" />
          <span className="layer-label label-right">WebP Output</span>
        </div>

        {/* Slider control line and handle */}
        <div className="slider-bar" style={{ left: `${sliderPos}%` }}>
          <div className="slider-handle">◂ ▸</div>
        </div>

        {/* Transparent range input strictly laid over the container */}
        <input
          type="range"
          min="0"
          max="100"
          value={sliderPos}
          onChange={(e) => setSliderPos(Number(e.target.value))}
          className="slider-input"
        />
      </div>
    </div>
  );
}
