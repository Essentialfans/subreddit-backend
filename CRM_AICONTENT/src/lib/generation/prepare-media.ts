/** Browser helpers to keep motion-control assets within kie.ai limits. */

const WAN_STILL_MAX_BYTES = 4.8 * 1024 * 1024; // Wan Animate Move docs: 5MB max

export function motionStillMaxBytes(modelId: string): number | null {
  if (modelId === "wan-animate-move") return WAN_STILL_MAX_BYTES;
  return null;
}

async function blobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
  if (!res.ok) throw new Error("Could not read the source still for compression");
  return res.blob();
}

function loadImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/** Downscale + JPEG-encode until under maxBytes (or best effort). */
export async function compressImageBlobUnderLimit(
  blob: Blob,
  maxBytes: number
): Promise<Blob> {
  if (blob.size <= maxBytes && /image\/(jpeg|jpg|webp)/i.test(blob.type)) {
    return blob;
  }

  const bitmap = await loadImageBitmap(blob);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    // Cap longest edge — motion models don't need 4K stills.
    const maxEdge = 1536;
    if (Math.max(width, height) > maxEdge) {
      const scale = maxEdge / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not compress still");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.88;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const out = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
      );
      if (out && out.size <= maxBytes) return out;
      if (out && attempt === 7) return out;
      quality = Math.max(0.45, quality - 0.1);
      if (attempt >= 3) {
        width = Math.max(640, Math.round(width * 0.85));
        height = Math.max(640, Math.round(height * 0.85));
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(bitmap, 0, 0, width, height);
      }
    }
    throw new Error("Could not compress still under kie.ai size limit");
  } finally {
    bitmap.close();
  }
}

/**
 * Ensure a still URL is under the model’s max size.
 * Returns the original URL when already small enough; otherwise a new JPEG blob.
 */
export async function ensureStillFitsModel(options: {
  url: string;
  modelId: string;
}): Promise<{ url: string; blob?: Blob; compressed: boolean; originalBytes: number }> {
  const max = motionStillMaxBytes(options.modelId);
  if (!max) {
    return { url: options.url, compressed: false, originalBytes: 0 };
  }

  const blob = await blobFromUrl(options.url);
  if (blob.size <= max) {
    return { url: options.url, compressed: false, originalBytes: blob.size };
  }

  const compressed = await compressImageBlobUnderLimit(blob, max);
  return {
    url: options.url,
    blob: compressed,
    compressed: true,
    originalBytes: blob.size,
  };
}

type DetectedBox = { x: number; y: number; width: number; height: number };

async function detectFaceBoxes(
  bitmap: ImageBitmap
): Promise<DetectedBox[]> {
  // Chromium FaceDetector when available — best path to scrub the SOURCE face.
  type FaceDetectorCtor = new (opts?: {
    fastMode?: boolean;
    maxDetectedFaces?: number;
  }) => {
    detect: (image: ImageBitmap) => Promise<Array<{ boundingBox: DetectedBox }>>;
  };
  const Detector = (
    globalThis as unknown as { FaceDetector?: FaceDetectorCtor }
  ).FaceDetector;
  if (typeof Detector === "function") {
    try {
      const detector = new Detector({ fastMode: true, maxDetectedFaces: 4 });
      const faces = await detector.detect(bitmap);
      return faces
        .map((f) => f.boundingBox)
        .filter((b) => b.width > 8 && b.height > 8);
    } catch {
      // fall through
    }
  }
  // Fallback: center-upper oval where a standing subject's head usually sits.
  const w = bitmap.width;
  const h = bitmap.height;
  return [
    {
      x: w * 0.28,
      y: h * 0.06,
      width: w * 0.44,
      height: h * 0.28,
    },
  ];
}

function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  block = 14
) {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.floor(w));
  const sh = Math.max(1, Math.floor(h));
  const sample = document.createElement("canvas");
  const tw = Math.max(1, Math.floor(sw / block));
  const th = Math.max(1, Math.floor(sh / block));
  sample.width = tw;
  sample.height = th;
  const sctx = sample.getContext("2d");
  if (!sctx) return;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, tw, th);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sample, 0, 0, tw, th, sx, sy, sw, sh);
  ctx.imageSmoothingEnabled = true;
}

/**
 * Scrub faces from a Recreate SOURCE still so the model cannot copy that identity.
 * Keeps pose/outfit/background; returns a JPEG blob ready to re-upload.
 */
export async function scrubSourceFacesForRecreate(
  url: string
): Promise<Blob> {
  const blob = await blobFromUrl(url);
  const bitmap = await loadImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare source still");
    ctx.drawImage(bitmap, 0, 0);

    const boxes = await detectFaceBoxes(bitmap);
    for (const box of boxes) {
      // Expand box so hairline / jaw are covered.
      const padX = box.width * 0.25;
      const padY = box.height * 0.35;
      const x = box.x - padX;
      const y = box.y - padY;
      const w = box.width + padX * 2;
      const h = box.height + padY * 2;
      pixelateRegion(ctx, x, y, w, h, 18);
      // Soft cover so features are unrecoverable.
      ctx.fillStyle = "rgba(40, 40, 40, 0.55)";
      ctx.beginPath();
      ctx.ellipse(
        x + w / 2,
        y + h / 2,
        w / 2,
        h / 2,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );
    if (!out) throw new Error("Could not scrub source face");
    return out;
  } finally {
    bitmap.close();
  }
}
