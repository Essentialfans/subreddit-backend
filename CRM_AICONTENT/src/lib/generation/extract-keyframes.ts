/** Browser-side keyframe grabs from a local File or blob URL. */

export interface KeyframeCapture {
  blob: Blob;
  timeSec: number;
  index: number;
  /** Relative motion score vs previous sample (0 if unknown). */
  motionScore?: number;
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      resolve(video);
    };
    video.addEventListener("loadeddata", onReady);
    video.onerror = () => reject(new Error("Could not read the source video"));
    video.src = src;
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const dur = Number.isFinite(video.duration) ? video.duration : time;
    const target = Math.min(Math.max(0, time), Math.max(0, dur - 0.05));

    const finish = () => {
      video.removeEventListener("seeked", onSeeked);
      // Ensure the decoded frame is painted (some browsers need a tick).
      const rvfc = (
        video as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback;
      if (typeof rvfc === "function") {
        rvfc.call(video, () => resolve());
      } else {
        requestAnimationFrame(() => resolve());
      }
    };

    const onSeeked = () => finish();
    video.addEventListener("seeked", onSeeked);
    video.onerror = () => reject(new Error("Seek failed"));

    if (Math.abs(video.currentTime - target) < 0.001) {
      finish();
      return;
    }
    video.currentTime = target;
  });
}

async function drawFrame(
  video: HTMLVideoElement,
  maxEdge: number
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  const scale =
    Math.max(video.videoWidth, video.videoHeight) > maxEdge
      ? maxEdge / Math.max(video.videoWidth, video.videoHeight)
      : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not capture keyframe");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function captureFrame(
  video: HTMLVideoElement,
  timeSec: number,
  index: number,
  motionScore?: number
): Promise<KeyframeCapture> {
  await seek(video, timeSec);
  const { canvas } = await drawFrame(video, 1280);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
  );
  if (!blob) throw new Error("Keyframe encode failed");
  return { blob, timeSec, index, motionScore };
}

function l1Delta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  // Sample every 4th pixel channel group for speed
  for (let i = 0; i < n; i += 16) {
    sum +=
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum;
}

/**
 * Dense probe → keep start/end + highest-motion moments (attention grabs).
 */
export async function pickMotionKeyframeTimes(
  video: HTMLVideoElement,
  keep = 8
): Promise<{ times: number[]; scores: Map<number, number> }> {
  const durationSec = video.duration;
  const end = Math.max(0, durationSec - 0.08);
  const probeCount = Math.min(36, Math.max(16, Math.round(durationSec * 2)));
  const probes: { t: number; score: number }[] = [];
  let prev: Uint8ClampedArray | null = null;

  for (let i = 0; i < probeCount; i++) {
    const t =
      i === 0
        ? 0.05
        : i === probeCount - 1
          ? end
          : (durationSec * i) / (probeCount - 1);
    await seek(video, t);
    const { ctx, canvas } = await drawFrame(video, 160);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const score = prev ? l1Delta(prev, data) : 0;
    probes.push({ t, score });
    prev = data;
  }

  const scores = new Map<number, number>();
  for (const p of probes) scores.set(p.t, p.score);

  // Always keep start + end
  const chosen: number[] = [probes[0].t, probes[probes.length - 1].t];

  // Rank by motion, enforce ≥0.7s spacing so peaks aren't duplicates
  const ranked = [...probes]
    .filter((p) => p.t > 0.3 && p.t < end - 0.2)
    .sort((a, b) => b.score - a.score);

  for (const p of ranked) {
    if (chosen.length >= keep) break;
    if (chosen.every((c) => Math.abs(c - p.t) >= 0.7)) {
      chosen.push(p.t);
    }
  }

  // Bias: ensure at least one sample in 35–55% window (common reveal zone)
  const midLo = durationSec * 0.35;
  const midHi = durationSec * 0.55;
  const hasMid = chosen.some((t) => t >= midLo && t <= midHi);
  if (!hasMid) {
    const midCandidates = ranked.filter((p) => p.t >= midLo && p.t <= midHi);
    const best = midCandidates[0] ?? {
      t: durationSec * 0.45,
      score: 0,
    };
    if (chosen.every((c) => Math.abs(c - best.t) >= 0.4)) {
      if (chosen.length >= keep) chosen.splice(2, 1); // drop a weaker mid pick
      chosen.push(best.t);
      scores.set(best.t, best.score);
    }
  }

  chosen.sort((a, b) => a - b);
  return { times: chosen.slice(0, keep), scores };
}

/**
 * Grab start / motion peaks / end as JPEG blobs.
 */
export async function extractKeyframesFromVideoFile(
  file: File,
  count = 8
): Promise<{ frames: KeyframeCapture[]; durationSec: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(objectUrl);
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    if (!durationSec || durationSec < 0.2) {
      throw new Error("Video has no readable duration");
    }
    const { times, scores } = await pickMotionKeyframeTimes(video, count);
    const frames: KeyframeCapture[] = [];
    for (let i = 0; i < times.length; i++) {
      frames.push(
        await captureFrame(video, times[i], i, scores.get(times[i]) ?? 0)
      );
    }
    video.src = "";
    video.load();
    return { frames, durationSec };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
