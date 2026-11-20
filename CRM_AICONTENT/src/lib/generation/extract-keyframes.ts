/** Browser-side full-timeline keyframe grabs from a local File or blob URL. */

export interface KeyframeCapture {
  blob: Blob;
  timeSec: number;
  index: number;
  /** Relative motion score vs previous sample (0 if unknown). */
  motionScore?: number;
}

export interface ExtractKeyframesOptions {
  /** Target seconds between frames (default 0.33 ≈ 3fps grid). */
  intervalSec?: number;
  /** Hard cap so uploads/LLM stay practical (default 48). */
  maxFrames?: number;
  onProgress?: (done: number, total: number) => void;
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
    const target = Math.min(Math.max(0, time), Math.max(0, dur - 0.04));

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", onSeeked);
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

    // Timeout fallback if seeked never fires
    const timer = window.setTimeout(() => finish(), 1200);

    if (Math.abs(video.currentTime - target) < 0.001) {
      window.clearTimeout(timer);
      finish();
      return;
    }
    video.currentTime = target;
    const clear = () => window.clearTimeout(timer);
    video.addEventListener("seeked", clear, { once: true });
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

function l1Delta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 16) {
    sum +=
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum;
}

/**
 * Build a dense timeline grid covering the whole clip.
 * Interval auto-widens only when maxFrames would otherwise be exceeded.
 */
export function buildFullTimelineTimes(
  durationSec: number,
  intervalSec = 0.33,
  maxFrames = 48
): number[] {
  const end = Math.max(0.05, durationSec - 0.04);
  const idealCount = Math.floor(end / intervalSec) + 1;
  const step =
    idealCount > maxFrames ? end / Math.max(1, maxFrames - 1) : intervalSec;

  const times: number[] = [];
  for (let t = 0.05; t <= end + 0.001; t += step) {
    times.push(Math.min(end, Number(t.toFixed(3))));
    if (times.length >= maxFrames) break;
  }
  if (times[times.length - 1] < end - 0.02) {
    if (times.length >= maxFrames) times[times.length - 1] = end;
    else times.push(end);
  }
  // De-dupe near-identical
  const out: number[] = [];
  for (const t of times) {
    if (!out.length || Math.abs(out[out.length - 1] - t) > 0.08) out.push(t);
  }
  return out;
}

/**
 * Capture a dense full-timeline grid so the inventory can recreate every beat.
 */
export async function extractKeyframesFromVideoFile(
  file: File,
  options: ExtractKeyframesOptions | number = {}
): Promise<{ frames: KeyframeCapture[]; durationSec: number }> {
  const opts: ExtractKeyframesOptions =
    typeof options === "number" ? { maxFrames: options } : options;
  const intervalSec = opts.intervalSec ?? 0.33;
  const maxFrames = opts.maxFrames ?? 48;

  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(objectUrl);
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    if (!durationSec || durationSec < 0.2) {
      throw new Error("Video has no readable duration");
    }

    const times = buildFullTimelineTimes(durationSec, intervalSec, maxFrames);
    opts.onProgress?.(0, times.length);

    const frames: KeyframeCapture[] = [];
    let prevPixels: Uint8ClampedArray | null = null;

    for (let i = 0; i < times.length; i++) {
      await seek(video, times[i]);
      const { canvas, ctx } = await drawFrame(video, 960);
      // Downsample in-place region for motion scoring
      const tw = Math.max(1, Math.round(canvas.width / 8));
      const th = Math.max(1, Math.round(canvas.height / 8));
      const tiny = document.createElement("canvas");
      tiny.width = tw;
      tiny.height = th;
      const tctx = tiny.getContext("2d");
      if (!tctx) throw new Error("Could not score keyframe motion");
      tctx.drawImage(canvas, 0, 0, tw, th);
      const pixels = tctx.getImageData(0, 0, tw, th).data;
      const motionScore = prevPixels ? l1Delta(prevPixels, pixels) : 0;
      prevPixels = pixels;
      void ctx;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82)
      );
      if (!blob) throw new Error("Keyframe encode failed");
      frames.push({
        blob,
        timeSec: times[i],
        index: i,
        motionScore,
      });
      opts.onProgress?.(i + 1, times.length);
    }

    video.src = "";
    video.load();
    return { frames, durationSec };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Pick a representative subset of URLs for the final Wan vision call. */
export function pickRepresentativeIndices(
  frames: { motionScore?: number; timeSec: number }[],
  keep = 10
): number[] {
  if (frames.length <= keep) {
    return frames.map((_, i) => i);
  }
  const chosen = new Set<number>([0, frames.length - 1]);
  const ranked = frames
    .map((f, i) => ({ i, score: f.motionScore ?? 0 }))
    .filter((r) => r.i !== 0 && r.i !== frames.length - 1)
    .sort((a, b) => b.score - a.score);
  for (const r of ranked) {
    if (chosen.size >= keep) break;
    chosen.add(r.i);
  }
  // Fill evenly if motion ranking under-fills
  if (chosen.size < keep) {
    const step = frames.length / keep;
    for (let k = 0; k < keep && chosen.size < keep; k++) {
      chosen.add(Math.min(frames.length - 1, Math.round(k * step)));
    }
  }
  return [...chosen].sort((a, b) => a - b);
}
