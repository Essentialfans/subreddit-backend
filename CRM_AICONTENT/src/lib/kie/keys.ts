import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret, keyHint } from "@/lib/kie/crypto";

export async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthorized");
  }
  return user.id;
}

export async function getKieKeyStatus(userId: string): Promise<{
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("provider_keys")
    .select("key_hint, updated_at")
    .eq("user_id", userId)
    .eq("provider", "kie")
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    configured: Boolean(data),
    hint: data?.key_hint ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}

export async function saveKieKey(userId: string, apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length < 10) {
    throw new Error("API key looks too short");
  }
  const { ciphertext, iv } = encryptSecret(trimmed);
  const admin = createAdminClient();
  const { error } = await admin.from("provider_keys").upsert(
    {
      user_id: userId,
      provider: "kie",
      ciphertext,
      iv,
      key_hint: keyHint(trimmed),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteKieKey(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("provider_keys")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "kie");
  if (error) throw new Error(error.message);
}

export async function loadKieApiKey(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("provider_keys")
    .select("ciphertext, iv")
    .eq("user_id", userId)
    .eq("provider", "kie")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Add your kie.ai API key in Settings first.");

  return decryptSecret(data.ciphertext, data.iv);
}
