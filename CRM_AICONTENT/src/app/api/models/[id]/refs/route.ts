import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/kie/keys";

export const runtime = "nodejs";

const BUCKET = "creator-models";

async function ensureBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.listBuckets();
  if (!data?.some((b) => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
    });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id: modelId } = await context.params;
    await ensureBucket();

    const admin = createAdminClient();
    const { data: model, error: modelErr } = await admin
      .from("creator_models")
      .select("id, user_id")
      .eq("id", modelId)
      .eq("user_id", userId)
      .maybeSingle();
    if (modelErr) throw new Error(modelErr.message);
    if (!model) {
      return NextResponse.json(
        { ok: false, error: "Model not found" },
        { status: 404 }
      );
    }

    const { count } = await admin
      .from("creator_model_refs")
      .select("*", { count: "exact", head: true })
      .eq("model_id", modelId);
    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { ok: false, error: "Max 3 reference images per model" },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file is required" },
        { status: 400 }
      );
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "File too large (max 8MB)" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${modelId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    const sortOrder = count ?? 0;

    const { data: ref, error: refErr } = await admin
      .from("creator_model_refs")
      .insert({
        model_id: modelId,
        user_id: userId,
        public_url: publicUrl,
        storage_path: path,
        sort_order: sortOrder,
      })
      .select("*")
      .single();
    if (refErr) throw new Error(refErr.message);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (sortOrder === 0) updates.cover_url = publicUrl;
    if ((count ?? 0) + 1 >= 3) updates.status = "ready";
    else updates.status = "in_progress";

    await admin.from("creator_models").update(updates).eq("id", modelId);

    return NextResponse.json({
      ok: true,
      ref: {
        id: ref.id,
        publicUrl: ref.public_url,
        storagePath: ref.storage_path,
        sortOrder: ref.sort_order,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
