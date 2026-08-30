"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  TelegramDeepLinkAuth,
  type CompletedTelegramResult,
} from "@/components/auth/telegram-deep-link-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type TelegramIdentity = {
  id: number;
  username: string | null;
  firstName: string | null;
};

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"telegram" | "details">("telegram");
  const [signupCode, setSignupCode] = useState<string | null>(null);
  const [telegram, setTelegram] = useState<TelegramIdentity | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTelegramCompleted = useCallback(
    async (result: CompletedTelegramResult) => {
      if (result.mode !== "signup") return;
      setSignupCode(result.code);
      setTelegram(result.telegram);
      if (result.telegram.firstName && !name) {
        setName(result.telegram.firstName);
      }
      setStep("details");
      setError("");
    },
    [name]
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!signupCode || !telegram) {
      setError("Verify Telegram first.");
      setStep("telegram");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/telegram/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: signupCode,
          name,
          email,
          password,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Sign up failed.");
      }

      if (payload.tokenHash) {
        const supabase = createClient();
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: "email",
          token_hash: payload.tokenHash,
        });
        if (otpError) {
          throw new Error(otpError.message);
        }
        router.push("/");
        router.refresh();
        return;
      }

      router.push("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AiInstaReels</h1>
            <p className="text-sm text-muted-foreground">
              Create your account to get started
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {step === "telegram" ? "Step 1 · Telegram" : "Step 2 · Account"}
            </CardTitle>
            <CardDescription>
              {step === "telegram"
                ? "Every account must verify Telegram first (anti-scam). Then add your email and password."
                : "Add your name, email, and password to finish signup."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "telegram" ? (
              <div className="space-y-4">
                <TelegramDeepLinkAuth
                  mode="signup"
                  onError={setError}
                  onCompleted={handleTelegramCompleted}
                />
                {error ? (
                  <p className="text-sm text-accent-red">{error}</p>
                ) : null}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <p className="font-medium text-accent-green">
                    Telegram verified
                  </p>
                  <p className="text-muted-foreground">
                    {telegram?.username
                      ? `@${telegram.username}`
                      : telegram?.firstName ?? "Telegram user"}
                    {telegram?.id ? ` · id ${telegram.id}` : null}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {error ? (
                  <p className="text-sm text-accent-red">{error}</p>
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setStep("telegram");
                    setSignupCode(null);
                    setTelegram(null);
                    setError("");
                  }}
                >
                  Use a different Telegram account
                </Button>
              </form>
            )}

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
              {" · "}
              <Link
                href="/forgot-password"
                className="font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
