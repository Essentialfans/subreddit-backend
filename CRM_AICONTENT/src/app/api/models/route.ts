import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/kie/keys";
import { slugifyModelName } from "@/lib/models/types";

export const runtime = "nodejs";

async function ensureBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.listBuckets();
  if (!data?.some((b) => b.name === "creator-models")) {
    await admin.storage.createBucket("creator-models", {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
    });
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const admin = createAdminClient();
    const { data: models, error } = await admin
      .from("creator_models")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (models ?? []).map((m) => m.id);
    let refsByModel: Record<string, unknown[]> = {};
    if (ids.length) {
      const { data: refs, error: refErr } = await admin
        .from("creator_model_refs")
        .select("*")
        .in("model_id", ids)
        .order("sort_order", { ascending: true });
      if (refErr) throw new Error(refErr.message);
      refsByModel = {};
      for (const ref of refs ?? []) {
        const list = (refsByModel[ref.model_id] ??= []);
        list.push(ref);
      }
    }

    return NextResponse.json({
      ok: true,
      models: (models ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        niche: m.niche,
        status: m.status,
        coverUrl: m.cover_url,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        refs: ((refsByModel[m.id] as Array<Record<string, unknown>>) ?? []).map(
          (r) => ({
            id: r.id,
            publicUrl: r.public_url,
            storagePath: r.storage_path,
            sortOrder: r.sort_order,
          })
        ),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await ensureBucket();
    const body = (await request.json()) as { name?: string; niche?: string };
    const name = body.name?.trim();
    if (!name || name.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Name is required" },
        { status: 400 }
      );
    }

    let slug = slugifyModelName(name);
    if (!slug) slug = `model-${Date.now().toString(36)}`;

    const admin = createAdminClient();
    // uniquify slug
    const { data: existing } = await admin
      .from("creator_models")
      .select("slug")
      .eq("user_id", userId)
      .like("slug", `${slug}%`);
    const taken = new Set((existing ?? []).map((r) => r.slug));
    let unique = slug;
    let i = 2;
    while (taken.has(unique)) {
      unique = `${slug}-${i++}`;
    }

    const { data, error } = await admin
      .from("creator_models")
      .insert({
        user_id: userId,
        name,
        slug: unique,
        niche: body.niche?.trim() || null,
        status: "in_progress",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      model: {
        id: data.id,
        name: data.name,
        slug: data.slug,
        niche: data.niche,
        status: data.status,
        coverUrl: data.cover_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        refs: [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
