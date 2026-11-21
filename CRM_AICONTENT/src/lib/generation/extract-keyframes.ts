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
 * Grab start / mid / end (and a couple action beats) as JPEG blobs.
 */
export async function extractKeyframesFromVideoFile(
  file: File,
  count = 5
): Promise<{ frames: KeyframeCapture[]; durationSec: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(objectUrl);
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    if (!durationSec || durationSec < 0.2) {
      throw new Error("Video has no readable duration");
    }
    const n = Math.min(8, Math.max(3, count));
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      const t =
        i === 0
          ? 0.05
          : i === n - 1
            ? Math.max(0, durationSec - 0.08)
            : (durationSec * i) / (n - 1);
      times.push(t);
    }
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
