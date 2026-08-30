import { createClient } from "@/lib/supabase/client";

export interface ProfileTelegramInfo {
  telegramId: number | null;
  telegramUsername: string | null;
  telegramVerified: boolean;
}

export async function fetchOwnTelegramProfile(): Promise<ProfileTelegramInfo> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      telegramId: null,
      telegramUsername: null,
      telegramVerified: false,
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("telegram_id, telegram_username, telegram_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    telegramId: data?.telegram_id ?? null,
    telegramUsername: data?.telegram_username ?? null,
    telegramVerified: Boolean(data?.telegram_verified),
  };
}
