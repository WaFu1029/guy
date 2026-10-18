// Client-side photo prep: every person photo is a centered square, 512px,
// JPEG — small enough (~100KB) to pass through a server action's 1MB body.

const SIZE = 512;

export function squareJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  mirror = false
): Promise<Blob> {
  const side = Math.min(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  // A front camera preview is shown mirrored; mirror the capture to match
  // what the user saw.
  if (mirror) {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read the photo"))), "image/jpeg", 0.85)
  );
}

export async function fileToSquareJpeg(file: File): Promise<Blob> {
  // imageOrientation applies EXIF rotation, so phone photos come out upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return await squareJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
