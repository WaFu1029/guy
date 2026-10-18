"use client";

import { useEffect, useRef, useState } from "react";
import { fileToSquareJpeg, squareJpeg } from "@/lib/photo";

// Camera sheet: live front-camera preview with a shutter, plus an upload
// fallback (on phones the picker offers the camera or the library). Hands
// back a square JPEG.
export function PhotoCapture({
  onCapture,
  onClose,
}: {
  onCapture: (photo: Blob) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    // No camera API at all (insecure origin, old browser) takes the same
    // async path as a denied permission.
    const media = navigator.mediaDevices
      ? navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 } },
          audio: false,
        })
      : Promise.reject(new Error("No camera API"));
    media
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCameraError("Camera unavailable — upload a photo instead."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shoot = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    try {
      onCapture(await squareJpeg(v, v.videoWidth, v.videoHeight, true));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onCapture(await fileToSquareJpeg(file));
    } catch {
      setCameraError("Couldn't read that image — try another.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Take a photo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-neutral-100 p-5 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-900">
          {!cameraError && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedData={() => setReady(true)}
              className="h-full w-full -scale-x-100 object-cover"
            />
          )}
          {cameraError && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-neutral-300">
              {cameraError}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-full px-4 py-2 text-sm text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-200 dark:text-neutral-300 dark:ring-neutral-700 dark:hover:bg-neutral-800"
          >
            Upload
          </button>
          <button
            type="button"
            onClick={shoot}
            disabled={!ready || busy || !!cameraError}
            aria-label="Take photo"
            className="h-14 w-14 rounded-full bg-neutral-900 ring-4 ring-neutral-300 transition-transform enabled:hover:scale-105 disabled:opacity-30 dark:bg-neutral-100 dark:ring-neutral-700"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
