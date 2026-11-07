import { createAdminClient } from "@/lib/supabase/admin";

export const OUTPUTS_BUCKET = "generation-outputs";
export const OUTPUT_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export type OutputKind = "image" | "video";

export interface GenerationOutput {
  id: string;
  kind: OutputKind;
  publicUrl: string;
  storagePath: string;
  sourceUrl: string | null;
  prompt: string | null;
  modelId: string | null;
  modelLabel: string | null;
  creatorModelId: string | null;
  aspect: string | null;
  resolution: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface PersistMeta {
  userId: string;
  kind: OutputKind;
  sourceUrl?: string | null;
  prompt?: string | null;
  modelId?: string | null;
  modelLabel?: string | null;
  creatorModelId?: string | null;
  aspect?: string | null;
  resolution?: string | null;
}

type DbRow = {
  id: string;
  kind: OutputKind;
  public_url: string;
  storage_path: string;
  source_url: string | null;
  prompt: string | null;
  model_id: string | null;
  model_label: string | null;
  creator_model_id: string | null;
  aspect: string | null;
  resolution: string | null;
  created_at: string;
  expires_at: string;
};

function mapRow(row: DbRow): GenerationOutput {
  return {
    id: row.id,
    kind: row.kind,
    publicUrl: row.public_url,
    storagePath: row.storage_path,
    sourceUrl: row.source_url,
    prompt: row.prompt,
    modelId: row.model_id,
    modelLabel: row.model_label,
    creatorModelId: row.creator_model_id,
    aspect: row.aspect,
    resolution: row.resolution,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function ensureOutputsBucket() {
  const admin = createAdminClient();
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw new Error(listErr.message);

  if (!buckets?.some((b) => b.name === OUTPUTS_BUCKET)) {
    const { error: createErr } = await admin.storage.createBucket(
      OUTPUTS_BUCKET,
      {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024,
      }
    );
    if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
      throw new Error(`Could not create outputs bucket: ${createErr.message}`);
    }
  }
  return admin;
}

function extFromContentType(kind: OutputKind, contentType: string | null) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("webm")) return "webm";
  return kind === "video" ? "mp4" : "png";
}

async function insertOutputRow(
  admin: ReturnType<typeof createAdminClient>,
  options: PersistMeta & { publicUrl: string; storagePath: string }
): Promise<GenerationOutput> {
  const expiresAt = new Date(Date.now() + OUTPUT_TTL_MS).toISOString();
  const creatorId =
    options.creatorModelId &&
    /^[0-9a-f-]{36}$/i.test(options.creatorModelId)
      ? options.creatorModelId
      : null;

  const { data, error } = await admin
    .from("generation_outputs")
    .insert({
      user_id: options.userId,
      kind: options.kind,
      public_url: options.publicUrl,
      storage_path: options.storagePath,
      source_url: options.sourceUrl ?? null,
      prompt: options.prompt ?? null,
      model_id: options.modelId ?? null,
      model_label: options.modelLabel ?? null,
      creator_model_id: creatorId,
      aspect: options.aspect ?? null,
      resolution: options.resolution ?? null,
      expires_at: expiresAt,
    })
    .select(
      "id, kind, public_url, storage_path, source_url, prompt, model_id, model_label, creator_model_id, aspect, resolution, created_at, expires_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to save output");
  }
  return mapRow(data as DbRow);
}

/** Upload raw bytes into Outputs storage + DB row. */
export async function persistGenerationOutputBytes(
  options: PersistMeta & {
    bytes: Buffer | Uint8Array;
    contentType?: string | null;
  }
): Promise<GenerationOutput> {
  const admin = await ensureOutputsBucket();
  const bytes = Buffer.from(options.bytes);
  if (bytes.length < 64) {
    throw new Error("Uploaded result looked empty");
  }

  const ext = extFromContentType(options.kind, options.contentType ?? null);
  const path = `${options.userId}/${options.kind}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const { error: upErr } = await admin.storage
    .from(OUTPUTS_BUCKET)
    .upload(path, bytes, {
      contentType:
        options.contentType ||
        (options.kind === "video" ? "video/mp4" : "image/png"),
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = admin.storage.from(OUTPUTS_BUCKET).getPublicUrl(path);

  try {
    return await insertOutputRow(admin, {
      ...options,
      publicUrl: pub.publicUrl,
      storagePath: path,
    });
  } catch (err) {
    await admin.storage.from(OUTPUTS_BUCKET).remove([path]).catch(() => null);
    throw err;
  }
}

/**
 * Server-side persist from a remote URL.
 * Falls back to storing the remote URL itself if download/upload fails
 * (common on Cloudflare Workers when the provider CDN blocks the fetch).
 */
export async function persistGenerationOutput(
  options: PersistMeta & { sourceUrl: string }
): Promise<GenerationOutput> {
  const sourceUrl = options.sourceUrl.trim();
  try {
    const remote = await fetch(sourceUrl, { cache: "no-store" });
    if (!remote.ok) {
      throw new Error(`Could not download result (${remote.status})`);
    }
    const contentType = remote.headers.get("content-type");
    const bytes = Buffer.from(await remote.arrayBuffer());
    return await persistGenerationOutputBytes({
      ...options,
      sourceUrl,
      bytes,
      contentType,
    });
  } catch (primary) {
    // Last resort: keep the provider URL so Outputs is still usable.
    try {
      const admin = createAdminClient();
      return await insertOutputRow(admin, {
        ...options,
        sourceUrl,
        publicUrl: sourceUrl,
        storagePath: `remote:${Date.now()}`,
      });
    } catch {
      throw primary instanceof Error
        ? primary
        : new Error("Could not save output");
    }
  }
}

/** Delete expired rows + storage objects. Safe to call often. */
export async function purgeExpiredOutputs(limit = 100): Promise<number> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("generation_outputs")
    .select("id, storage_path")
    .lt("expires_at", now)
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) return 0;

  const paths = rows
    .map((r) => r.storage_path as string)
    .filter((p) => p && !p.startsWith("remote:"));
  if (paths.length) {
    await admin.storage.from(OUTPUTS_BUCKET).remove(paths).catch(() => null);
  }

  const ids = rows.map((r) => r.id as string);
  const { error: delErr } = await admin
    .from("generation_outputs")
    .delete()
    .in("id", ids);
  if (delErr) throw new Error(delErr.message);
  return ids.length;
}

export async function listUserOutputs(
  userId: string,
  kind?: OutputKind | null
): Promise<GenerationOutput[]> {
  await purgeExpiredOutputs().catch(() => 0);
  const admin = createAdminClient();
  let query = admin
    .from("generation_outputs")
    .select(
      "id, kind, public_url, storage_path, source_url, prompt, model_id, model_label, creator_model_id, aspect, resolution, created_at, expires_at"
    )
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(120);

  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as DbRow[] | null)?.map(mapRow) ?? [];
}

export async function deleteUserOutput(
  userId: string,
  outputId: string
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("generation_outputs")
    .select("id, storage_path")
    .eq("user_id", userId)
    .eq("id", outputId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;

  if (data.storage_path && !String(data.storage_path).startsWith("remote:")) {
    await admin.storage
      .from(OUTPUTS_BUCKET)
      .remove([data.storage_path])
      .catch(() => null);
  }
  const { error: delErr } = await admin
    .from("generation_outputs")
    .delete()
    .eq("user_id", userId)
    .eq("id", outputId);
  if (delErr) throw new Error(delErr.message);
}
