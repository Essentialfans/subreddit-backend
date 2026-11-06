"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Mode = "link" | "login" | "signup";

interface CompletedLink {
  mode: "link";
  profile: {
    telegramId: number;
    telegramUsername: string | null;
    telegramVerified: boolean;
  };
}

interface CompletedLogin {
  mode: "login";
  tokenHash: string;
  email: string;
  telegramUsername: string | null;
}

interface CompletedSignup {
  mode: "signup";
  code: string;
  telegram: {
    id: number;
    username: string | null;
    firstName: string | null;
  };
}

export type CompletedTelegramResult =
  | CompletedLink
  | CompletedLogin
  | CompletedSignup;

interface TelegramDeepLinkAuthProps {
  mode: Mode;
  onCompleted: (result: CompletedTelegramResult) => void | Promise<void>;
  onError?: (message: string) => void;
  autoStart?: boolean;
}

export function TelegramDeepLinkAuth({
  mode,
  onCompleted,
  onError,
  autoStart = false,
}: TelegramDeepLinkAuthProps) {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const completingRef = useRef(false);
  const autoStartedRef = useRef(false);

  const reportError = useCallback(
    (message: string) => {
      setError(message);
      onError?.(message);
    },
    [onError]
  );

  const start = useCallback(async () => {
    setIsStarting(true);
    setError("");
    setStatus("starting");
    completingRef.current = false;

    try {
      const response = await fetch("/api/auth/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start Telegram auth.");
      }
      setCode(payload.code);
      setDeepLink(payload.deepLink);
      setStatus("pending");
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : "Could not start Telegram auth."
      );
      setStatus("error");
    } finally {
      setIsStarting(false);
    }
  }, [mode, reportError]);

  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void start();
    }
  }, [autoStart, start]);

  useEffect(() => {
    if (!code || status !== "pending") return;

    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(
          `/api/auth/telegram/status?code=${encodeURIComponent(code!)}`,
          { cache: "no-store" }
        );
        const payload = await response.json();

        if (cancelled) return;

        if (payload.status === "pending") {
          setStatus("pending");
          return;
        }

        if (payload.status === "expired") {
          setStatus("expired");
          reportError("Telegram link expired. Start again.");
          return;
        }

        if (payload.status === "completed") {
          if (completingRef.current) return;
          completingRef.current = true;
          setStatus("completed");
          await onCompleted(payload as CompletedTelegramResult);
          return;
        }

        if (payload.status === "error" || !response.ok) {
          setStatus("error");
          reportError(payload.error ?? "Telegram verification failed.");
        }
      } catch (err) {
        if (!cancelled) {
          reportError(
            err instanceof Error ? err.message : "Telegram status check failed."
          );
        }
      }
    }

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [code, status, onCompleted, reportError]);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  if (!botUsername) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Telegram is not configured. Set{" "}
        <code className="text-foreground">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code>{" "}
        and <code className="text-foreground">TELEGRAM_BOT_TOKEN</code>.
      </p>
    );
  }

  const startLabel =
    mode === "link"
      ? "Link Telegram via bot"
      : mode === "signup"
        ? "Verify with Telegram"
        : "Continue with Telegram bot";

  return (
    <div className="space-y-3">
      {!deepLink ? (
        <Button
          type="button"
          variant={mode === "signup" ? "default" : "secondary"}
          className="w-full"
          onClick={() => void start()}
          disabled={isStarting}
        >
          {isStarting ? "Preparing…" : startLabel}
        </Button>
      ) : (
        <>
          <Button asChild className="w-full">
            <a href={deepLink} target="_blank" rel="noreferrer">
              Open @{botUsername.replace(/^@/, "")} in Telegram
            </a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {status === "pending"
              ? "Waiting for you to press Start in Telegram…"
              : status === "completed"
                ? "Verified…"
                : status === "expired"
                  ? "Expired."
                  : null}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => void start()}
          >
            Generate a new link
          </Button>
        </>
      )}
      {error ? <p className="text-sm text-accent-red">{error}</p> : null}
    </div>
  );
}
