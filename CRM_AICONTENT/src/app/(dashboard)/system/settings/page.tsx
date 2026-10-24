"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { TelegramDeepLinkAuth } from "@/components/auth/telegram-deep-link-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchOwnTelegramProfile } from "@/lib/profiles";

export default function SettingsPage() {
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
            Open our bot once to link your Telegram account. We store your
            Telegram id and @username for anti-scam review. No public website
            domain required for local use.
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
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
              <p className="font-medium text-accent-orange">Not verified yet</p>
              <p className="mt-1 text-muted-foreground">
                Link Telegram to unlock job creation.
              </p>
            </div>
          )}

          {error ? <p className="text-sm text-accent-red">{error}</p> : null}
          {success ? <p className="text-sm text-accent-green">{success}</p> : null}

          <TelegramDeepLinkAuth
            mode="link"
            onError={setError}
            onCompleted={async (result) => {
              if (result.mode !== "link") return;
              setTelegramId(result.profile.telegramId);
              setTelegramUsername(result.profile.telegramUsername);
              setVerified(Boolean(result.profile.telegramVerified));
              setSuccess("Telegram linked. Your account is verified.");
            }}
          />

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
