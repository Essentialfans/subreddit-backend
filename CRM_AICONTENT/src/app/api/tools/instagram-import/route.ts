import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/kie/keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { OUTPUTS_BUCKET } from "@/lib/outputs/store";
import {
  resolveInstagramMedia,
  type InstagramMediaItem,
} from "@/lib/instagram/resolve";

export const runtime = "nodejs";

async function rehostMedia(
  userId: string,
  item: InstagramMediaItem,
  shortcode: string
): Promise<string> {
  const admin = createAdminClient();
  const { data: buckets } = await admin.storage.listBuckets();
  const isVideo = item.type === "video";
  const bucket = isVideo ? OUTPUTS_BUCKET : "creator-models";
  const limit = isVideo ? 50 * 1024 * 1024 : 8 * 1024 * 1024;

  if (!buckets?.some((b) => b.name === bucket)) {
    const { error: createErr } = await admin.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: limit,
    });
    if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
      throw new Error(createErr.message);
    }
  }

  // rapidcdn JWT tokens are minted for TelegramBot UA — match that when rehosting
  const res = await fetch(item.url, {
    headers: {
      "User-Agent": "TelegramBot (like TwitterBot)",
      Referer: "https://www.instagram.com/",
      Accept: "*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Could not download media (HTTP ${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > limit) {
    throw new Error(
      isVideo ? "Video is over 50MB" : "Image is over 8MB"
    );
  }

  const ext = isVideo ? "mp4" : "jpg";
  const path = `${userId}/instagram/${shortcode}-${Date.now()}.${ext}`;
  const contentType =
    res.headers.get("content-type") ||
    (isVideo ? "video/mp4" : "image/jpeg");
  const { error } = await admin.storage.from(bucket).upload(path, buf, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function isDirectMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return false;
    return (
      /\.(mp4|m3u8|mov|webm)(\?|$)/i.test(u.pathname + u.search) ||
      /rapidcdn\.app|fbcdn\.net|cdninstagram\.com/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      url?: string;
      rehost?: boolean;
    };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "Instagram URL or direct media URL is required" },
        { status: 400 }
      );
    }

    // FastDL / other downloaders: paste the direct MP4 link and we rehost it.
    if (isDirectMediaUrl(url)) {
      const isVideo = !/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
      const shortcode = `direct-${Date.now()}`;
      const primary: InstagramMediaItem = {
        type: isVideo ? "video" : "photo",
        url,
        thumbnail: null,
      };
      const hostedUrl =
        body.rehost === false
          ? null
          : await rehostMedia(userId, primary, shortcode);
      return NextResponse.json({
        ok: true,
        shortcode,
        sourceUrl: url,
        thumbnail: null,
        items: [
          {
            type: primary.type,
            url: hostedUrl || url,
          },
        ],
        hostedUrl,
        downloadUrl: hostedUrl || url,
        mediaType: primary.type,
        note: "Imported direct media URL into your workspace.",
      });
    }

    const resolved = await resolveInstagramMedia(url);
    const primary =
      resolved.items.find((i) => i.type === "video") ?? resolved.items[0];

    let hostedUrl: string | null = null;
    if (body.rehost !== false && primary) {
      hostedUrl = await rehostMedia(userId, primary, resolved.shortcode);
    }

    return NextResponse.json({
      ok: true,
      shortcode: resolved.shortcode,
      sourceUrl: resolved.sourceUrl,
      thumbnail: resolved.thumbnail,
      items: resolved.items.map((i) => ({
        type: i.type,
        // Don't leak intermediary tokens to client unless needed — prefer hosted
        url: i.type === primary?.type ? hostedUrl || i.url : i.url,
      })),
      hostedUrl,
      downloadUrl: hostedUrl || primary?.url || null,
      mediaType: primary?.type ?? null,
      note: resolved.note,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Instagram import failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
