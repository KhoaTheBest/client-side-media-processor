import React, { useEffect, useRef, useState } from "react";

interface AudioWaveformProps {
  audioUrl: string;
}

export function AudioWaveform({ audioUrl }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsStatePlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    // Decode audio file and generate peaks using Web Audio API
    let active = true;
    const loadAudioData = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        // Use standard AudioContext to decode
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        if (!active) return;

        const rawData = decodedBuffer.getChannelData(0); // primary channel
        const width = 120; // number of peaks/bars to render
        const blockSize = Math.floor(rawData.length / width);
        const computedPeaks: number[] = [];

        for (let i = 0; i < width; i++) {
          const start = i * blockSize;
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const val = Math.abs(rawData[start + j]);
            if (val > max) max = val;
          }
          computedPeaks.push(max);
        }

        setPeaks(computedPeaks);
        setDuration(decodedBuffer.duration);
        audioCtx.close();
      } catch (err) {
        console.error("Failed to decode audio track peaks:", err);
      }
    };

    loadAudioData();

    return () => {
      active = false;
    };
  }, [audioUrl]);

  // Draw peaks on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const barWidth = w / peaks.length;
    const gap = 1.5;

    // Draw background grid lines
    ctx.strokeStyle = "rgba(16, 185, 129, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 10; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Playhead index position
    const playheadIdx = duration > 0 ? (currentTime / duration) * peaks.length : 0;

    peaks.forEach((peak, i) => {
      const barHeight = peak * h * 0.95;
      const x = i * barWidth;
      const y = (h - barHeight) / 2;

      // Color peaks based on playhead position
      if (i < playheadIdx) {
        ctx.fillStyle = "#10b981"; // Active bright green
      } else {
        ctx.fillStyle = "rgba(16, 185, 129, 0.25)"; // Dim inactive green
      }

      ctx.beginPath();
      ctx.roundRect(x + gap, y, barWidth - gap * 2, barHeight, 2);
      ctx.fill();
    });

    // Draw playhead vertical line
    if (duration > 0 && currentTime > 0) {
      const playheadX = (currentTime / duration) * w;
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }
  }, [peaks, currentTime, duration]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsStatePlaying(false);
    } else {
      audio.play().then(() => {
        setIsStatePlaying(true);
      });
    }
  };

  return (
    <div className="audio-visualizer">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsStatePlaying(false)}
      />
      
      <div className="waveform-container" onClick={togglePlay}>
        <canvas ref={canvasRef} className="waveform-canvas" style={{ height: "64px", width: "100%" }} />
        {peaks.length === 0 && (
          <div className="waveform-loading">Analyzing Waveform...</div>
        )}
      </div>

      <div className="waveform-controls">
        <button type="button" onClick={togglePlay} className="waveform-btn">
          {isPlaying ? "▮▮ Pause" : "▶ Play Audio"}
        </button>
        <span className="waveform-time">
          {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
