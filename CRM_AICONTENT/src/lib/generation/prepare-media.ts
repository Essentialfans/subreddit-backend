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
