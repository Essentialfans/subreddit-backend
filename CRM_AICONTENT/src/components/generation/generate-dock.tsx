"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clapperboard,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Square,
  Smartphone,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IMAGE_MODELS } from "@/lib/kie/models";
import type { CreatorModel } from "@/lib/models/types";
import {
  PRESET_CATEGORIES,
  PRESET_QUALITY,
  RATIO_OPTIONS,
  RECREATE_GEN_MODELS,
  RESOLUTION_OPTIONS,
  type GenerateMode,
} from "@/lib/generation/presets";
import { parseAtMentions } from "@/lib/generation/prompt";
import "./generate-dock.css";

type Slot =
  | { state: "empty" }
  | { state: "generating" }
  | { state: "done"; url: string }
  | { state: "error"; message: string };

function RatioIcon({ id }: { id: string }) {
  if (id === "1:1") return <Square className="h-3.5 w-3.5" />;
  if (id === "9:16" || id === "4:5" || id === "3:4")
    return <Smartphone className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export function GenerateDock({
  initialModelId,
}: {
  initialModelId?: string | null;
}) {
  const [creatorModels, setCreatorModels] = useState<CreatorModel[]>([]);
  const [creatorId, setCreatorId] = useState<string | null>(
    initialModelId ?? null
  );
  const creator = creatorModels.find((m) => m.id === creatorId) ?? null;

  const [mode, setMode] = useState<GenerateMode>("free");
  const [prompt, setPrompt] = useState("");
  const [enhance, setEnhance] = useState(true);
  const [share, setShare] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1K");
  const [genModelId, setGenModelId] = useState(IMAGE_MODELS[0]?.id ?? "");
  const [presetId, setPresetId] = useState(PRESET_CATEGORIES[0]?.id ?? "");
  const [presetQuality, setPresetQuality] = useState<string>(
    PRESET_QUALITY[1]?.id ?? "seedream-5-pro"
  );
  const [keepPose, setKeepPose] = useState(true);
  const [sourceUrl, setSourceUrl] = useState("");
  const [clothing, setClothing] = useState<"model" | "source" | "external">(
    "model"
  );
  const [extraRefs, setExtraRefs] = useState<string[]>([]);
  const [slots, setSlots] = useState<Slot[]>([
    { state: "empty" },
    { state: "empty" },
    { state: "empty" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expandedPrompt, setExpandedPrompt] = useState("");
  const [keyReady, setKeyReady] = useState<boolean | null>(null);

  const [openMenu, setOpenMenu] = useState<
    null | "model" | "gen" | "ratio" | "res"
  >(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadModels = useCallback(async () => {
    const res = await fetch("/api/models", { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; models?: CreatorModel[] };
    if (json.ok && json.models) {
      setCreatorModels(json.models);
      setCreatorId((prev) => {
        if (prev && json.models!.some((m) => m.id === prev)) return prev;
        if (initialModelId && json.models!.some((m) => m.id === initialModelId))
          return initialModelId;
        return json.models![0]?.id ?? null;
      });
    }
  }, [initialModelId]);

  useEffect(() => {
    void loadModels();
    void fetch("/api/settings/kie", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { configured?: boolean }) => setKeyReady(Boolean(j.configured)))
      .catch(() => setKeyReady(false));
  }, [loadModels]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Auto-pick creator from @mentions in free mode
  useEffect(() => {
    if (mode !== "free") return;
    const { modelSlugs } = parseAtMentions(prompt);
    if (!modelSlugs.length) return;
    const hit = creatorModels.find(
      (m) =>
        modelSlugs.includes(m.slug) ||
        modelSlugs.includes(m.name.toLowerCase().replace(/\s+/g, ""))
    );
    if (hit) setCreatorId(hit.id);
  }, [prompt, mode, creatorModels]);

  const activeGenModels = useMemo(() => {
    if (mode === "recreate") {
      return IMAGE_MODELS.filter((m) =>
        RECREATE_GEN_MODELS.some((r) => r.id === m.id)
      );
    }
    if (mode === "presets") {
      return IMAGE_MODELS.filter((m) =>
        PRESET_QUALITY.some((q) => q.id === m.id)
      );
    }
    return IMAGE_MODELS;
  }, [mode]);

  useEffect(() => {
    if (!activeGenModels.some((m) => m.id === genModelId)) {
      const fallback =
        mode === "presets"
          ? presetQuality
          : mode === "recreate"
            ? "seedream-5-pro"
            : activeGenModels[0]?.id;
      if (fallback) setGenModelId(fallback);
    }
  }, [mode, activeGenModels, genModelId, presetQuality]);

  async function uploadPublicFile(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/generation/upload", {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as {
      ok: boolean;
      url?: string;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.url) {
      throw new Error(json.error || "Upload failed");
    }
    return json.url;
  }

  async function onUploadRef(file: File) {
    if (extraRefs.length >= 4) return;
    try {
      const url = await uploadPublicFile(file);
      setExtraRefs((prev) => [...prev, url].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ref upload failed");
    }
  }

  async function onGenerate() {
    setError("");
    if (!keyReady) {
      setError("Add your kie.ai API key in Settings first.");
      return;
    }
    if (!creator && mode !== "free") {
      setError("Select a model from My Models first.");
      return;
    }
    if (mode === "recreate" && !sourceUrl.trim()) {
      setError("Recreate needs a source image URL or upload.");
      return;
    }

    const preset = PRESET_CATEGORIES.find((p) => p.id === presetId);
    const mentions = parseAtMentions(prompt);
    const refLabels = [
      ...mentions.refTags,
      ...extraRefs.map((_, i) => `ref${i + 1}`),
    ];

    setBusy(true);
    setSlots((prev) =>
      prev.map((s, i) => (i < quantity ? { state: "generating" } : s))
    );

    try {
      const enhanceRes = await fetch("/api/generation/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          userText: prompt,
          modelName: creator?.name,
          presetHint: preset?.promptHint,
          enhanceWithAi: enhance || mode !== "free",
          refLabels,
          keepPose,
        }),
      });
      const enhanceJson = (await enhanceRes.json()) as {
        ok: boolean;
        prompt?: string;
        error?: string;
      };
      if (!enhanceRes.ok || !enhanceJson.ok || !enhanceJson.prompt) {
        throw new Error(enhanceJson.error || "Prompt expand failed");
      }
      setExpandedPrompt(enhanceJson.prompt);

      const identityUrls = creator?.refs.map((r) => r.publicUrl) ?? [];
        const imageUrls = [
        ...(mode === "recreate" && sourceUrl ? [sourceUrl] : []),
        ...identityUrls,
        ...extraRefs,
      ];

      const tasks: Promise<string>[] = [];
      for (let i = 0; i < quantity; i++) {
        tasks.push(
          (async () => {
            const createRes = await fetch("/api/generation/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                modelId: mode === "presets" ? presetQuality : genModelId,
                prompt: enhanceJson.prompt,
                aspect: ratio,
                resolution,
                imageUrls,
              }),
            });
            const created = (await createRes.json()) as {
              ok: boolean;
              taskId?: string;
              error?: string;
            };
            if (!createRes.ok || !created.ok || !created.taskId) {
              throw new Error(created.error || "Create failed");
            }
            return pollTask(created.taskId);
          })()
        );
      }

      const urls = await Promise.all(tasks);
      setSlots((prev) =>
        prev.map((s, i) =>
          i < urls.length ? { state: "done", url: urls[i] } : s
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
      setSlots((prev) =>
        prev.map((s, i) =>
          i < quantity ? { state: "error", message } : s
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gen-dock-page">
      <div className="gen-dock-stage">
        {slots.map((slot, i) => (
          <div key={i} className="gen-dock-cell group">
            {slot.state === "generating" ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm">Generating…</span>
              </div>
            ) : slot.state === "done" ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slot.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-black/80 to-transparent p-3 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                  <Link
                    href={`/video/single?image=${encodeURIComponent(slot.url)}${
                      creatorId ? `&model=${creatorId}` : ""
                    }`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow"
                  >
                    <Clapperboard className="h-3.5 w-3.5" />
                    Send to video
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </>
            ) : slot.state === "error" ? (
              <p className="px-6 text-center text-sm text-accent-red">
                {slot.message}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Ready</p>
            )}
          </div>
        ))}
        <div className="gen-dock-cell flex-col gap-3 px-4 text-center">
          <p className="text-xs text-muted-foreground">
            {creator
              ? `${creator.name} · ${creator.refs.length}/3 refs`
              : "No model selected"}
          </p>
          {creator?.coverUrl || creator?.refs[0]?.publicUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.coverUrl || creator.refs[0]?.publicUrl}
              alt=""
              className="h-28 w-20 rounded-xl object-cover"
            />
          ) : null}
          <Link
            href="/models"
            className="text-xs font-medium text-primary hover:underline"
          >
            My Models
          </Link>
          {expandedPrompt ? (
            <p className="line-clamp-6 text-left text-[11px] text-muted-foreground">
              {expandedPrompt}
            </p>
          ) : null}
        </div>
      </div>

      <div className="gen-dock-panel" ref={menuRef}>
        {/* Row 1 */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="relative space-y-1">
            <p className="gen-label">Model</p>
            <button
              type="button"
              className="gen-chip"
              data-active={openMenu === "model"}
              onClick={() =>
                setOpenMenu((m) => (m === "model" ? null : "model"))
              }
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {(creator?.name ?? "M").slice(0, 1).toUpperCase()}
              </span>
              {creator?.name ?? "Select model"}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {openMenu === "model" ? (
              <div className="gen-menu left-0 top-[calc(100%+6px)]">
                {creatorModels.length === 0 ? (
                  <Link
                    href="/models"
                    className="block px-2 py-2 text-sm text-primary"
                  >
                    Create a model first →
                  </Link>
                ) : (
                  creatorModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      data-active={m.id === creatorId}
                      onClick={() => {
                        setCreatorId(m.id);
                        setOpenMenu(null);
                      }}
                    >
                      {m.id === creatorId ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <span className="w-3.5" />
                      )}
                      {m.name}
                      <span className="ml-auto text-[10px] opacity-60">
                        {m.refs.length}/3
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-1">
            <p className="gen-label">Mode</p>
            <div className="flex rounded-full border border-border bg-muted p-0.5">
              {(
                [
                  ["presets", "Presets"],
                  ["recreate", "Recreate"],
                  ["free", "Free prompting"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition",
                    mode === id
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "presets" ? (
            <div className="min-w-0 flex-1 space-y-1">
              <p className="gen-label">Category · slide to see more</p>
              <div className="gen-cat-rail">
                {PRESET_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="gen-cat"
                    data-active={presetId === c.id}
                    onClick={() => setPresetId(c.id)}
                  >
                    <div className="gen-cat-thumb">{c.label.slice(0, 2)}</div>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "recreate" ? (
            <div className="space-y-1">
              <p className="gen-label">Clothing</p>
              <div className="flex rounded-full border border-border bg-muted p-0.5">
                {(
                  [
                    ["model", "Model"],
                    ["source", "Source"],
                    ["external", "External"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setClothing(id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium",
                      clothing === id
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "free" ? (
            <div className="space-y-1">
              <p className="gen-label">Refs</p>
              <div className="flex items-center gap-2">
                {extraRefs.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={`ref${i + 1}`}
                    title={`@ref${i + 1}`}
                    className="h-9 w-9 rounded-lg object-cover"
                  />
                ))}
                <label className="gen-chip cursor-pointer">
                  <Plus className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadRef(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>

        {/* Row 2 — prompt / recreate source */}
        {mode === "recreate" ? (
          <div className="grid gap-3 md:grid-cols-[100px_1fr]">
            <label className="flex h-[52px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground">
              {sourceUrl ? "Source ✓" : "Source"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void uploadPublicFile(f)
                    .then(setSourceUrl)
                    .catch((err) =>
                      setError(
                        err instanceof Error ? err.message : "Source upload failed"
                      )
                    );
                  e.target.value = "";
                }}
              />
            </label>
            <div className="relative">
              <input
                className="gen-prompt pr-40"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Extra guidance (optional)…"
              />
              <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-2 text-xs text-muted-foreground sm:flex">
                Keep pose
                <button
                  type="button"
                  className="gen-toggle"
                  data-on={keepPose}
                  onClick={() => setKeepPose((v) => !v)}
                  aria-label="Keep pose"
                />
              </div>
            </div>
            <input
              className="gen-prompt md:col-span-2"
              value={/^https?:\/\//i.test(sourceUrl) ? sourceUrl : ""}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="Or paste source image URL (https://…)"
            />
          </div>
        ) : (
          <div className="relative">
            <input
              className="gen-prompt pr-[170px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === "presets"
                  ? "Short scene for your model…"
                  : "Describe the scene for your model… type @ to tag a model or @ref1"
              }
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2 text-xs text-muted-foreground">
              Enhance with AI
              <button
                type="button"
                className="gen-toggle"
                data-on={enhance}
                onClick={() => setEnhance((v) => !v)}
                aria-label="Enhance with AI"
              />
            </div>
          </div>
        )}

        {mode === "presets" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="gen-label mr-1">Quality</p>
            {PRESET_QUALITY.map((q) => (
              <button
                key={q.id}
                type="button"
                className="gen-chip"
                data-active={presetQuality === q.id}
                onClick={() => {
                  setPresetQuality(q.id);
                  setGenModelId(q.id);
                }}
              >
                {q.label}
              </button>
            ))}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Keep pose & composition
              <button
                type="button"
                className="gen-toggle"
                data-on={keepPose}
                onClick={() => setKeepPose((v) => !v)}
              />
            </div>
          </div>
        ) : null}

        {/* Row 3 */}
        <div className="flex flex-wrap items-center gap-3">
          {mode !== "presets" ? (
            <div className="relative space-y-1">
              <p className="gen-label">
                {mode === "recreate" ? "Model" : "Gen model"}
              </p>
              <button
                type="button"
                className="gen-chip"
                onClick={() =>
                  setOpenMenu((m) => (m === "gen" ? null : "gen"))
                }
              >
                {IMAGE_MODELS.find((m) => m.id === genModelId)?.label ??
                  "Model"}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
              {openMenu === "gen" ? (
                <div className="gen-menu left-0 bottom-[calc(100%+6px)]">
                  {activeGenModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      data-active={m.id === genModelId}
                      onClick={() => {
                        setGenModelId(m.id);
                        setOpenMenu(null);
                      }}
                    >
                      {m.id === genModelId ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <span className="w-3.5" />
                      )}
                      {m.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="relative space-y-1">
            <p className="gen-label">Ratio</p>
            <button
              type="button"
              className="gen-chip"
              onClick={() =>
                setOpenMenu((m) => (m === "ratio" ? null : "ratio"))
              }
            >
              <RatioIcon id={ratio} />
              {RATIO_OPTIONS.find((r) => r.id === ratio)?.label ?? ratio}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {openMenu === "ratio" ? (
              <div className="gen-menu left-0 bottom-[calc(100%+6px)]">
                {RATIO_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    data-active={r.id === ratio}
                    onClick={() => {
                      setRatio(r.id);
                      setOpenMenu(null);
                    }}
                  >
                    <RatioIcon id={r.id} />
                    {r.label}
                    {r.id === ratio ? (
                      <Check className="ml-auto h-3.5 w-3.5" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative space-y-1">
            <p className="gen-label">Resolution</p>
            <button
              type="button"
              className="gen-chip"
              onClick={() => setOpenMenu((m) => (m === "res" ? null : "res"))}
            >
              {resolution}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {openMenu === "res" ? (
              <div className="gen-menu left-0 bottom-[calc(100%+6px)]">
                {RESOLUTION_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    data-active={r.id === resolution}
                    onClick={() => {
                      setResolution(r.id);
                      setOpenMenu(null);
                    }}
                  >
                    {r.label}
                    {r.id === resolution ? (
                      <Check className="ml-auto h-3.5 w-3.5" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Share with community
            <button
              type="button"
              className="gen-toggle"
              data-on={share}
              onClick={() => setShare((v) => !v)}
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-full border border-border bg-muted">
              <button
                type="button"
                className="px-2 py-2 text-muted-foreground"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-6 text-center text-sm">{quantity}</span>
              <button
                type="button"
                className="px-2 py-2 text-muted-foreground"
                onClick={() => setQuantity((q) => Math.min(3, q + 1))}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onGenerate()}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate
            </button>
          </div>
        </div>

        {error ? <p className="text-sm text-accent-red">{error}</p> : null}
        {keyReady === false ? (
          <p className="text-xs text-muted-foreground">
            kie.ai not connected —{" "}
            <Link href="/system/settings" className="text-primary underline">
              add API key
            </Link>
          </p>
        ) : null}
        {mode === "free" && extraRefs.length ? (
          <p className="text-xs text-muted-foreground">
            Tag refs in the prompt as{" "}
            {extraRefs.map((_, i) => `@ref${i + 1}`).join(" ")}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

async function pollTask(taskId: string): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 8 * 60 * 1000) {
    const res = await fetch(
      `/api/generation/status?taskId=${encodeURIComponent(taskId)}`,
      { cache: "no-store" }
    );
    const json = (await res.json()) as {
      ok: boolean;
      status?: string;
      imageUrls?: string[];
      resultUrls?: string[];
      failMsg?: string;
      error?: string;
    };
    if (!res.ok || !json.ok) throw new Error(json.error || "Status failed");
    if (json.status === "failed") {
      throw new Error(json.failMsg || "Generation failed");
    }
    if (json.status === "success") {
      const url = json.imageUrls?.[0] || json.resultUrls?.[0];
      if (!url) throw new Error("No image URL returned");
      return url;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Timed out waiting for kie.ai");
}
