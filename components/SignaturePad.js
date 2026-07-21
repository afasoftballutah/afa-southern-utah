"use client";

import { useEffect, useRef, useCallback } from "react";
import SignaturePadLib from "signature_pad";

/**
 * Draw-on-screen signature capture. Reports a base64 PNG data URL to the
 * parent via onChange whenever the drawing changes, and null when cleared.
 */
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    padRef.current?.clear();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    padRef.current = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255,255,255)",
      penColor: "rgb(22,35,61)",
    });
    padRef.current.addEventListener("endStroke", () => {
      onChange(padRef.current.isEmpty() ? null : padRef.current.toDataURL("image/png"));
    });
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full h-40 rounded border-2 border-afa-navy/30 bg-white touch-none"
      />
      <button
        type="button"
        onClick={() => {
          padRef.current?.clear();
          onChange(null);
        }}
        className="text-sm font-semibold text-afa-navy underline"
      >
        Clear signature
      </button>
    </div>
  );
}
