/** Browser-side keyframe grabs from a local File or blob URL. */

export interface KeyframeCapture {
  blob: Blob;
  timeSec: number;
  index: number;
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("Could not read the source video"));
    video.src = src;
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.onerror = () => reject(new Error("Seek failed"));
    const dur = Number.isFinite(video.duration) ? video.duration : time;
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, dur - 0.05));
  });
}

async function captureFrame(
  video: HTMLVideoElement,
  timeSec: number,
  index: number
): Promise<KeyframeCapture> {
  await seek(video, timeSec);
  const canvas = document.createElement("canvas");
  const maxEdge = 1280;
  const scale =
    Math.max(video.videoWidth, video.videoHeight) > maxEdge
      ? maxEdge / Math.max(video.videoWidth, video.videoHeight)
      : 1;
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not capture keyframe");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88)
  );
  if (!blob) throw new Error("Keyframe encode failed");
  return { blob, timeSec, index };
}

/**
 * Sample start / mid-action / end with extra density around 35–55% of the
 * clip (where wardrobe reveals often land on ~15s reels).
 */
export function pickKeyframeTimes(durationSec: number, count = 7): number[] {
  const n = Math.min(8, Math.max(5, count));
  const end = Math.max(0, durationSec - 0.08);
  const fractions =
    n >= 7
      ? [0.01, 0.2, 0.38, 0.45, 0.52, 0.72, 0.99]
      : [0.01, 0.25, 0.42, 0.55, 0.99];
  const picked = fractions.slice(0, n).map((f) =>
    Math.min(end, Math.max(0.05, durationSec * f))
  );
  // De-dupe near-identical seeks
  const out: number[] = [];
  for (const t of picked) {
    if (!out.length || Math.abs(out[out.length - 1] - t) > 0.12) out.push(t);
  }
  if (out[out.length - 1] < end - 0.05) out.push(end);
  return out.slice(0, 8);
}

/**
 * Grab start / mid / end (and mid-action beats) as JPEG blobs.
 */
export async function extractKeyframesFromVideoFile(
  file: File,
  count = 7
): Promise<{ frames: KeyframeCapture[]; durationSec: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(objectUrl);
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    if (!durationSec || durationSec < 0.2) {
      throw new Error("Video has no readable duration");
    }
    const times = pickKeyframeTimes(durationSec, count);
    const frames: KeyframeCapture[] = [];
    for (let i = 0; i < times.length; i++) {
      frames.push(await captureFrame(video, times[i], i));
    }
    video.src = "";
    video.load();
    return { frames, durationSec };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
