"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function KieApiKeyCard() {
  const [configured, setConfigured] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/kie", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        configured?: boolean;
        hint?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load key status");
      }
      setConfigured(Boolean(json.configured));
      setHint(json.hint ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/settings/kie", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        configured?: boolean;
        hint?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save key");
      }
      setConfigured(true);
      setHint(json.hint ?? null);
      setApiKey("");
      setSuccess("kie.ai key saved. Single Generation can bill against your credits.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onRemove() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/settings/kie", { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not remove key");
      }
      setConfigured(false);
      setHint(null);
      setSuccess("kie.ai key removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          kie.ai API key
        </CardTitle>
        <CardDescription>
          Your personal Market key powers Single Generation (image + video).
          Stored encrypted on the server — never sent back in full.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : configured ? (
          <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium text-accent-green">Connected</p>
            <p className="mt-1 text-muted-foreground">
              Key {hint ?? "••••"} · used for Image & Video models
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium text-accent-orange">Not connected</p>
            <p className="mt-1 text-muted-foreground">
              Paste a key from{" "}
              <a
                href="https://kie.ai"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                kie.ai
              </a>{" "}
              to unlock generation.
            </p>
          </div>
        )}

        <form onSubmit={onSave} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kie-key">API key</Label>
            <Input
              id="kie-key"
              type="password"
              autoComplete="off"
              placeholder="Paste kie.ai API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !apiKey.trim()}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : configured ? (
                "Replace key"
              ) : (
                "Save key"
              )}
            </Button>
            {configured ? (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => void onRemove()}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </form>

        {error ? <p className="text-sm text-accent-red">{error}</p> : null}
        {success ? <p className="text-sm text-accent-green">{success}</p> : null}
      </CardContent>
    </Card>
  );
}
