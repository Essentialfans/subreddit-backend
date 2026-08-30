"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchOwnTelegramProfile } from "@/lib/profiles";
import type { TelegramAuthPayload } from "@/lib/telegram/verify";

export default function SettingsPage() {
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const profile = await fetchOwnTelegramProfile();
      setTelegramId(profile.telegramId);
      setTelegramUsername(profile.telegramUsername);
      setVerified(profile.telegramVerified);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleTelegramAuth(telegram: TelegramAuthPayload) {
    setError("");
    setSuccess("");
    setIsLinking(true);

    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "link", telegram }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not link Telegram.");
      }

      setTelegramId(payload.profile.telegramId);
      setTelegramUsername(payload.profile.telegramUsername);
      setVerified(Boolean(payload.profile.telegramVerified));
      setSuccess("Telegram linked. Your account is verified.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link Telegram.");
    } finally {
      setIsLinking(false);
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Settings"
        subtitle="Account security and Telegram verification"
      />

      <Card>
        <CardHeader>
          <CardTitle>Telegram verification</CardTitle>
          <CardDescription>
            Link your Telegram account once so we can see your @username and
            reduce fake accounts. After linking, you can also sign in with
            Telegram.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : verified ? (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
              <p className="font-medium text-accent-green">Telegram verified</p>
              <p className="mt-1 text-muted-foreground">
                {telegramUsername ? `@${telegramUsername}` : "No username set"}
                {telegramId ? ` · id ${telegramId}` : null}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                You can re-link to refresh your username if it changed.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
              <p className="font-medium text-accent-orange">Not verified yet</p>
              <p className="mt-1 text-muted-foreground">
                Link Telegram to unlock full job creation and so we can review
                your public username.
              </p>
            </div>
          )}

          {error ? <p className="text-sm text-accent-red">{error}</p> : null}
          {success ? <p className="text-sm text-accent-green">{success}</p> : null}
          {isLinking ? (
            <p className="text-sm text-muted-foreground">Linking Telegram…</p>
          ) : null}

          <TelegramLoginButton onAuth={handleTelegramAuth} />

          <Button type="button" variant="secondary" onClick={() => void refresh()}>
            Refresh status
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Use forgot password if you need to reset your email login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary">
            <a href="/forgot-password">Forgot password</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
