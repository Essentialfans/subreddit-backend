"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CreatorModel } from "@/lib/models/types";

export function MyModelsPage() {
  const [models, setModels] = useState<CreatorModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "ready" | "in_progress">("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/models", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        models?: CreatorModel[];
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load");
      setModels(json.models ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = models.find((m) => m.id === selectedId) ?? null;

  const filtered = models.filter((m) => {
    if (filter === "ready" && m.status !== "ready") return false;
    if (filter === "in_progress" && m.status !== "in_progress") return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.slug.includes(q) ||
      (m.niche ?? "").toLowerCase().includes(q)
    );
  });

  const readyCount = models.filter((m) => m.status === "ready").length;
  const progressCount = models.filter((m) => m.status === "in_progress").length;

  async function createModel(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        model?: CreatorModel;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.model) {
        throw new Error(json.error || "Could not create");
      }
      setName("");
      setModels((prev) => [json.model!, ...prev]);
      setSelectedId(json.model.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function uploadRef(file: File) {
    if (!selected) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/models/${selected.id}/refs`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      await refresh();
      setSelectedId(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Models</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable identities. Keep every reference, detail and edit together.
          </p>
          <div className="mt-3 flex gap-4 text-sm">
            <span>
              <strong className="text-foreground">{readyCount}</strong>{" "}
              <span className="text-muted-foreground">Ready to create</span>
            </span>
            <span>
              <strong className="text-foreground">{progressCount}</strong>{" "}
              <span className="text-muted-foreground">In progress</span>
            </span>
          </div>
        </div>
        <Button
          onClick={() => {
            setSelectedId(null);
            document.getElementById("new-model-name")?.focus();
          }}
        >
          <Plus className="h-4 w-4" />
          Create new model
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or niche"
            className="border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
          />
        </div>
        {(
          [
            ["all", "All models"],
            ["ready", "Ready"],
            ["in_progress", "In progress"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              filter === id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-accent-red">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading models…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={cn(
                    "group overflow-hidden rounded-2xl border bg-card text-left transition",
                    selectedId === m.id
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="aspect-[3/4] bg-muted">
                    {m.coverUrl || m.refs[0]?.publicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.coverUrl || m.refs[0]?.publicUrl}
                        alt={m.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <UserRound className="h-10 w-10 opacity-40" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-0.5 p-3">
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.refs.length} of 3 references
                      {m.status === "ready" ? " · Ready" : " · In progress"}
                    </p>
                  </div>
                </button>
              ))}

              <form
                onSubmit={createModel}
                className="flex aspect-[3/4] flex-col justify-between rounded-2xl border border-dashed border-border bg-card/50 p-4"
              >
                <div>
                  <p className="text-sm font-semibold">New model</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Name an identity, then upload up to 3 face refs.
                  </p>
                </div>
                <div className="space-y-2">
                  <Input
                    id="new-model-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. MuscleMommy"
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={creating || name.trim().length < 2}
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-4">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  @{selected.slug} · {selected.refs.length}/3 refs
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {selected.refs.map((ref, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={ref.id}
                    src={ref.publicUrl}
                    alt={`ref ${i + 1}`}
                    className="aspect-square rounded-lg object-cover"
                  />
                ))}
                {selected.refs.length < 3 ? (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="mb-1 h-4 w-4" />
                        Add ref
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadRef(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                One identity. A consistent look across your images and videos.
              </p>
              <Button asChild className="w-full">
                <Link href={`/image/generate?model=${selected.id}`}>
                  Select · Image generation
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                One identity. A consistent look across your images and videos.
              </p>
              <Button disabled variant="secondary" className="w-full">
                Select
              </Button>
              <Button
                className="w-full"
                onClick={() =>
                  document.getElementById("new-model-name")?.focus()
                }
              >
                <Plus className="h-4 w-4" />
                Create new model
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
