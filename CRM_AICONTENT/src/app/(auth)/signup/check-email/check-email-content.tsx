"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

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
              Almost there — one more step
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-accent-blue/10">
              <Mail className="h-7 w-7 text-accent-blue" />
            </div>
            <CardTitle>Account created</CardTitle>
            <CardDescription>
              {email ? (
                <>
                  We sent a confirmation link to{" "}
                  <span className="font-medium text-foreground">{email}</span>
                </>
              ) : (
                "We sent a confirmation link to your email address."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Please{" "}
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent-blue hover:underline"
              >
                check your email
              </a>{" "}
              and click the confirmation link to activate your account.
            </p>
            <Button asChild className="w-full">
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Gmail
              </a>
            </Button>
            <p className="text-sm text-muted-foreground">
              Already confirmed?{" "}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
