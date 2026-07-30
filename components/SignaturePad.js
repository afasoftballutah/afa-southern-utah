"use client";

import { useEffect, useRef, useCallback } from "react";
import SignaturePadLib from "signature_pad";

/**
 * Draw-on-screen signature capture. Reports a base64 PNG data URL to the parent
 * via onChange whenever the drawing changes, and null when there is nothing
 * drawn.
 *
 * The invariant this is built around: what the parent holds always matches what
 * is on the canvas. It used to clear the pad on every window resize while
 * telling the parent nothing, so a signer could scroll on a phone, watch the ink
 * vanish, and still have an enabled Sign button submitting a signature that was
 * no longer on screen. On a liability waiver. A resize now carries the drawing
 * across, and every path that can change it reports the result.
 */
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  // resizeCanvas is registered once, for the life of the component, so it must
  // not close over the first render's onChange.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The parent's copy of the signature and what is drawn on the canvas must
  // never disagree. Every path that can change the drawing reports through
  // here, so a pad that ends up empty always disables the Sign button.
  const publish = useCallback(() => {
    const pad = padRef.current;
    onChangeRef.current(pad && !pad.isEmpty() ? pad.toDataURL("image/png") : null);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth * ratio;
    const height = canvas.offsetHeight * ratio;
    // On a phone, `resize` fires when the URL bar collapses on scroll and when
    // the keyboard opens — neither of which changes the canvas box. Assigning
    // width/height blanks the bitmap even when the value is identical, so bail
    // before touching it and the common case never disturbs the drawing at all.
    if (canvas.width === width && canvas.height === height) return;
    // A genuine resize (rotation) does blank the bitmap. Carry the strokes
    // across as point data, which is resolution-independent, and redraw them.
    // Reading the bitmap back would just re-import the blanking.
    const strokes = pad?.toData() ?? [];
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").scale(ratio, ratio);
    if (!pad) return;
    pad.clear();
    if (strokes.length) pad.fromData(strokes);
    publish();
  }, [publish]);

  useEffect(() => {
    const canvas = canvasRef.current;
    padRef.current = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255,255,255)",
      penColor: "rgb(22,35,61)",
    });
    padRef.current.addEventListener("endStroke", publish);
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", resizeCanvas);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("orientationchange", resizeCanvas);
    };
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
          publish();
        }}
        className="text-sm font-semibold text-afa-navy underline"
      >
        Clear signature
      </button>
    </div>
  );
}
