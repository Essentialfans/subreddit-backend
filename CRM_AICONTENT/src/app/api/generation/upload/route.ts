import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/kie/keys";
import { OUTPUTS_BUCKET } from "@/lib/outputs/store";

export const runtime = "nodejs";

const IMAGE_BUCKET = "creator-models";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const admin = createAdminClient();
    const { data: buckets } = await admin.storage.listBuckets();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file is required" },
        { status: 400 }
      );
    }

    const isVideo = (file.type || "").startsWith("video/");
    const bucket = isVideo ? OUTPUTS_BUCKET : IMAGE_BUCKET;
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

    if (file.size > limit) {
      return NextResponse.json(
        {
          ok: false,
          error: isVideo
            ? "Motion video must be under 50MB"
            : "Image must be under 8MB",
        },
        { status: 400 }
      );
    }

    const ext =
      file.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
    const path = `${userId}/uploads/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(bucket).upload(path, buffer, {
      contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
      upsert: false,
    });
    if (error) throw new Error(error.message);

    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
