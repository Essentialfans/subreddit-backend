import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/kie/keys";
import { OUTPUTS_BUCKET } from "@/lib/outputs/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Wan 3.0 reference_audio max clip length. */
const MAX_AUDIO_SEC = 15;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-800) || `ffmpeg exited ${code}`));
    });
  });
}

/**
 * Pull a short MP3 from a public video URL for Wan 3.0 @Audio1 voice matching.
 */
export async function POST(request: Request) {
  const workDir = join(tmpdir(), `ainsta-audio-${randomUUID()}`);
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as { videoUrl?: string };
    const videoUrl = body.videoUrl?.trim();
    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
      return NextResponse.json(
        { ok: false, error: "videoUrl is required" },
        { status: 400 }
      );
    }

    const res = await fetch(videoUrl, {
      headers: {
        "User-Agent": "TelegramBot (like TwitterBot)",
        Accept: "*/*",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Could not download video (HTTP ${res.status})` },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 1024) {
      return NextResponse.json(
        { ok: false, error: "Video file looked empty" },
        { status: 400 }
      );
    }
    if (buf.byteLength > 80 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Video is too large to extract audio from" },
        { status: 400 }
      );
    }

    await fs.mkdir(workDir, { recursive: true });
    const inPath = join(workDir, "in.bin");
    const outPath = join(workDir, "voice.mp3");
    await fs.writeFile(inPath, buf);

    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-t",
      String(MAX_AUDIO_SEC),
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "4",
      "-ac",
      "1",
      "-ar",
      "44100",
      outPath,
    ]);

    const mp3 = await fs.readFile(outPath);
    if (mp3.byteLength < 256) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No usable audio track in that video — upload an MP3 voice clip instead.",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === OUTPUTS_BUCKET)) {
      const { error: createErr } = await admin.storage.createBucket(
        OUTPUTS_BUCKET,
        { public: true, fileSizeLimit: 50 * 1024 * 1024 }
      );
      if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
        throw new Error(createErr.message);
      }
    }

    const path = `${userId}/uploads/voice-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`;
    const { error } = await admin.storage.from(OUTPUTS_BUCKET).upload(path, mp3, {
      contentType: "audio/mpeg",
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = admin.storage.from(OUTPUTS_BUCKET).getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      url: data.publicUrl,
      note: `Extracted first ${MAX_AUDIO_SEC}s of audio for Wan @Audio1 voice match.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audio extract failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
}
