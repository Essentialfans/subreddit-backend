"use client";

import { useEffect, useId, useRef } from "react";
import type { TelegramAuthPayload } from "@/lib/telegram/verify";

declare global {
  interface Window {
    onAiInstaTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

interface TelegramLoginButtonProps {
  onAuth: (user: TelegramAuthPayload) => void;
  botUsername?: string;
  cornerRadius?: number;
  requestWrite?: boolean;
}

export function TelegramLoginButton({
  onAuth,
  botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  cornerRadius = 8,
  requestWrite = false,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackName = useId().replace(/:/g, "_");
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    if (!botUsername || !containerRef.current) return;

    const globalName = `onAiInstaTelegramAuth_${callbackName}`;
    (window as unknown as Record<string, unknown>)[globalName] = (
      user: TelegramAuthPayload
    ) => {
      onAuthRef.current(user);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", String(cornerRadius));
    script.setAttribute("data-onauth", `${globalName}(user)`);
    if (requestWrite) {
      script.setAttribute("data-request-access", "write");
    }

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(script);

    return () => {
      delete (window as unknown as Record<string, unknown>)[globalName];
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [botUsername, callbackName, cornerRadius, requestWrite]);

  if (!botUsername) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Telegram login is not configured yet. Set{" "}
        <code className="text-foreground">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code>{" "}
        and <code className="text-foreground">TELEGRAM_BOT_TOKEN</code>.
      </p>
    );
  }

  return (
    <div className="flex justify-center" ref={containerRef} />
  );
}
