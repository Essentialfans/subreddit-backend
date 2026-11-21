/** Browser-side full-timeline keyframe grabs from a local File or blob URL. */

export interface KeyframeCapture {
  blob: Blob;
  timeSec: number;
  index: number;
  /** Relative motion score vs previous sample (0 if unknown). */
  motionScore?: number;
}

export interface ExtractKeyframesOptions {
  /** Target seconds between frames (default 0.4). */
  intervalSec?: number;
  /** Hard cap so uploads/LLM stay practical (default 36). */
  maxFrames?: number;
  onProgress?: (done: number, total: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    // Keep off-screen but in the document — improves decode/seek reliability.
    video.style.cssText =
      "position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
    document.body.appendChild(video);

    const fail = (msg: string) => {
      cleanupVideo(video);
      reject(new Error(msg));
    };

    const ready = () => {
      if (!Number.isFinite(video.duration) || video.duration < 0.2) {
        fail("Video has no readable duration");
        return;
      }
      if (!video.videoWidth || !video.videoHeight) {
        fail("Video has no readable dimensions");
        return;
      }
      resolve(video);
    };

    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener(
      "error",
      () => fail("Could not read the source video"),
      { once: true }
    );
    // Safety: some browsers only fire loadedmetadata
    video.addEventListener(
      "loadedmetadata",
      () => {
        if (video.readyState >= 2) ready();
      },
      { once: true }
    );
    window.setTimeout(() => {
      if (video.readyState >= 2 && video.videoWidth) ready();
    }, 2500);

    video.src = src;
    video.load();
  });
}

function cleanupVideo(video: HTMLVideoElement) {
  try {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  } catch {
    // ignore
  }
}

/**
 * Seek without requestVideoFrameCallback — rvfc often never fires for
 * off-DOM / paused videos and left capture stuck at 0/N.
 */
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const dur = Number.isFinite(video.duration) ? video.duration : time;
    const target = Math.min(Math.max(0, time), Math.max(0, dur - 0.04));

    if (Math.abs(video.currentTime - target) < 0.04) {
      resolve();
      return;
    }

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onSeeked = () => done();
    const onError = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("Seek failed"));
    };

    // Hard cap — never hang a frame capture.
    const timer = window.setTimeout(done, 700);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      video.currentTime = target;
    } catch {
      done();
    }
  });
}

function drawFrame(
  video: HTMLVideoElement,
  maxEdge: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 1280;
  const scale = Math.max(vw, vh) > maxEdge ? maxEdge / Math.max(vw, vh) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(vw * scale));
  canvas.height = Math.max(1, Math.round(vh * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not capture keyframe");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // toBlob can theoretically stall; hard-timeout + toDataURL fallback.
    const timer = window.setTimeout(() => {
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const bin = atob(dataUrl.split(",")[1] ?? "");
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: "image/jpeg" }));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Keyframe encode failed"));
      }
    }, 2000);

    canvas.toBlob(
      (blob) => {
        window.clearTimeout(timer);
        if (blob) resolve(blob);
        else reject(new Error("Keyframe encode failed"));
      },
      "image/jpeg",
      quality
    );
  });
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
  intervalSec = 0.4,
  maxFrames = 36
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
  const intervalSec = opts.intervalSec ?? 0.4;
  const maxFrames = opts.maxFrames ?? 36;

  const objectUrl = URL.createObjectURL(file);
  let video: HTMLVideoElement | null = null;
  try {
    video = await loadVideo(objectUrl);
    const durationSec = video.duration;
    const times = buildFullTimelineTimes(durationSec, intervalSec, maxFrames);
    opts.onProgress?.(0, times.length);

    const frames: KeyframeCapture[] = [];
    let prevPixels: Uint8ClampedArray | null = null;

    for (let i = 0; i < times.length; i++) {
      await seek(video, times[i]);
      // Brief settle so the decoded frame is available without rvfc.
      await sleep(20);

      const { canvas } = drawFrame(video, 720);
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

      const blob = await canvasToJpeg(canvas, 0.78);
      frames.push({
        blob,
        timeSec: times[i],
        index: i,
        motionScore,
      });
      opts.onProgress?.(i + 1, times.length);
    }

    return { frames, durationSec };
  } finally {
    if (video) cleanupVideo(video);
    URL.revokeObjectURL(objectUrl);
  }
}
