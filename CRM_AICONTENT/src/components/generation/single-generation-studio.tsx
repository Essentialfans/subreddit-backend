"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Clapperboard,
  Film,
  ImageIcon,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { modelsForMode, type GenerationMode } from "@/lib/kie/models";
import "./single-generation-studio.css";

interface HistoryItem {
  id: string;
  mode: GenerationMode;
  modelLabel: string;
  prompt: string;
  url: string;
  kind: "image" | "video";
  at: number;
}

interface KeyStatus {
  configured: boolean;
  hint: string | null;
}

export function SingleGenerationStudio() {
  const [mode, setMode] = useState<GenerationMode>("image");
  const models = useMemo(() => modelsForMode(mode), [mode]);
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const model = models.find((m) => m.id === modelId) ?? models[0];

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState(model?.defaultAspect ?? "9:16");
  const [duration, setDuration] = useState(model?.defaultDuration ?? 5);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "queued" | "running" | "done" | "error"
  >("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultKind, setResultKind] = useState<"image" | "video" | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [handoffFlash, setHandoffFlash] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/kie", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { configured?: boolean; hint?: string | null }) => {
        setKeyStatus({
          configured: Boolean(j.configured),
          hint: j.hint ?? null,
        });
      })
      .catch(() => setKeyStatus({ configured: false, hint: null }));
  }, []);

  useEffect(() => {
    const next = modelsForMode(mode);
    setModelId((prev) =>
      next.some((m) => m.id === prev) ? prev : (next[0]?.id ?? "")
    );
  }, [mode]);

  useEffect(() => {
    if (!model) return;
    setAspect(model.defaultAspect);
    if (model.defaultDuration) setDuration(model.defaultDuration);
  }, [model]);

  function switchMode(next: GenerationMode) {
    setMode(next);
    setError("");
    setPhase("idle");
    setStatusLabel("");
  }

  function useImageForVideo(url: string) {
    setReferenceUrl(url);
    setMode("video");
    setHandoffFlash(true);
    setError("");
    setPhase("idle");
    setStatusLabel("Image attached — pick a video model and generate.");
    window.setTimeout(() => setHandoffFlash(false), 1600);
  }

  async function pollTask(taskId: string, forMode: GenerationMode) {
    const started = Date.now();
    while (Date.now() - started < 8 * 60 * 1000) {
      const res = await fetch(
        `/api/generation/status?taskId=${encodeURIComponent(taskId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok: boolean;
        status?: string;
        state?: string;
        imageUrls?: string[];
        videoUrls?: string[];
        resultUrls?: string[];
        failMsg?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Status check failed");
      }

      setStatusLabel(`kie.ai · ${json.state || json.status}`);
      if (json.status === "failed") {
        throw new Error(json.failMsg || "Generation failed on kie.ai");
      }
      if (json.status === "success") {
        const video =
          json.videoUrls?.[0] ||
          json.resultUrls?.find((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u));
        const image =
          json.imageUrls?.[0] ||
          json.resultUrls?.find((u) =>
            /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)
          ) ||
          json.resultUrls?.[0];

        if (forMode === "video" && video) {
          return { url: video, kind: "video" as const };
        }
        if (image) {
          return { url: image, kind: "image" as const };
        }
        if (video) return { url: video, kind: "video" as const };
        throw new Error("Task finished but no media URL was returned");
      }

      setPhase("running");
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error("Timed out waiting for kie.ai — retry shortly.");
  }

  async function onGenerate() {
    if (!model) return;
    setBusy(true);
    setError("");
    setResultUrl(null);
    setResultKind(null);
    setPhase("queued");
    setStatusLabel("Creating kie.ai task…");

    try {
      const res = await fetch("/api/generation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          prompt,
          aspect,
          duration: model.mode === "video" ? duration : undefined,
          imageUrl: referenceUrl.trim() || null,
          audioUrl: audioUrl.trim() || null,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        taskId?: string;
        error?: string;
        modelLabel?: string;
      };
      if (!res.ok || !json.ok || !json.taskId) {
        throw new Error(json.error || "Could not start generation");
      }

      setPhase("running");
      setStatusLabel("Task queued — polling…");
      const done = await pollTask(json.taskId, model.mode);
      setResultUrl(done.url);
      setResultKind(done.kind);
      setPhase("done");
      setStatusLabel("Ready");
      setHistory((prev) =>
        [
          {
            id: json.taskId!,
            mode: model.mode,
            modelLabel: json.modelLabel || model.label,
            prompt: prompt.trim(),
            url: done.url,
            kind: done.kind,
            at: Date.now(),
          },
          ...prev,
        ].slice(0, 8)
      );
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-root -mx-6 -mt-2 lg:-mx-8">
      <div className="studio-inner mx-auto max-w-[1480px]">
        <header className="studio-enter relative mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--studio-mute)]">
              Projection booth
            </p>
            <h1 className="display text-3xl font-extrabold text-[var(--studio-cream)] sm:text-4xl">
              Single Generation
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--studio-mute)]">
              Image and video from your kie.ai Market key — generate a still,
              then send it straight into any video model.
            </p>
          </div>
          <div className="rounded-full border border-[var(--studio-line)] bg-black/30 px-4 py-2 text-xs text-[var(--studio-mute)]">
            {keyStatus?.configured ? (
              <span>
                kie.ai{" "}
                <span className="text-[var(--studio-teal)]">connected</span>
                {keyStatus.hint ? ` · ${keyStatus.hint}` : ""}
              </span>
            ) : (
              <span>
                kie.ai{" "}
                <span className="text-[var(--studio-rose)]">not connected</span>
                {" · "}
                <Link
                  href="/system/settings"
                  className="text-[var(--studio-amber)] underline-offset-2 hover:underline"
                >
                  Add key
                </Link>
              </span>
            )}
          </div>
        </header>

        <div className="relative grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
          <aside className="studio-enter flex flex-col gap-3 rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-panel)]/90 p-3">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-mute)]">
              Mode
            </p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <ModeButton
                active={mode === "image"}
                tone="teal"
                icon={<ImageIcon className="h-4 w-4" />}
                label="Image gen"
                onClick={() => switchMode("image")}
              />
              <ModeButton
                active={mode === "video"}
                tone="rose"
                icon={<Clapperboard className="h-4 w-4" />}
                label="Video gen"
                onClick={() => switchMode("video")}
              />
            </div>

            <div className="mt-2 flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-mute)]">
                {mode === "image" ? "AI Image API" : "AI Video API"}
              </p>
              <span className="text-[10px] text-[var(--studio-mute)]">
                {models.length}
              </span>
            </div>

            <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModelId(m.id)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition",
                    modelId === m.id
                      ? "border-[var(--studio-amber)]/50 bg-[rgba(232,165,75,0.12)]"
                      : "border-transparent hover:border-[var(--studio-line)] hover:bg-white/[0.03]"
                  )}
                >
                  <Film
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      modelId === m.id
                        ? "text-[var(--studio-amber)]"
                        : "text-[var(--studio-mute)]"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="display text-[13px] font-semibold leading-tight">
                        {m.label}
                      </span>
                      {m.badge === "new" ? (
                        <span className="rounded bg-[var(--studio-rose)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
                          New
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--studio-mute)]">
                      {m.blurb}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section
            className={cn(
              "studio-enter relative overflow-hidden rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-panel)]/95 p-5",
              handoffFlash && "ring-2 ring-[var(--studio-teal)]/60"
            )}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                  mode === "image"
                    ? "bg-[rgba(62,207,191,0.15)] text-[var(--studio-teal)]"
                    : "bg-[rgba(232,120,106,0.15)] text-[var(--studio-rose)]"
                )}
              >
                {mode === "image" ? "Still frame" : "Motion pass"}
              </span>
              <span className="text-sm text-[var(--studio-mute)]">
                {model?.label}
              </span>
            </div>

            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-mute)]">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder={
                mode === "image"
                  ? "Portrait of a creator under neon rain, 9:16, shallow depth of field…"
                  : "Slow push-in, hair and coat moving in the wind, cinematic street lights…"
              }
              className="w-full resize-none rounded-xl border border-[var(--studio-line)] bg-black/35 px-4 py-3 text-sm leading-relaxed text-[var(--studio-cream)] outline-none placeholder:text-[rgba(243,230,207,0.35)] focus:ring-1 focus:ring-[var(--studio-amber)]"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Aspect">
                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value)}
                  className="studio-select"
                >
                  {(model?.aspectOptions ?? ["9:16"]).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              {mode === "video" && model?.durations ? (
                <Field label="Duration">
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="studio-select"
                  >
                    {model.durations.map((d) => (
                      <option key={d} value={d}>
                        {d}s
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Output">
                  <div className="studio-select flex items-center text-[var(--studio-mute)]">
                    Still · PNG/JPG
                  </div>
                </Field>
              )}
              <Field label="Provider">
                <div className="studio-select flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--studio-amber)]" />
                  kie.ai Market
                </div>
              </Field>
            </div>

            {(mode === "video" || referenceUrl) && (
              <div className="mt-4 space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-mute)]">
                  Reference image
                  {mode === "video" ? " (image → video)" : ""}
                </label>
                <div
                  className={cn(
                    "flex gap-3 rounded-xl border border-dashed p-3",
                    referenceUrl
                      ? "border-[var(--studio-teal)]/50 bg-[rgba(62,207,191,0.08)]"
                      : "border-[var(--studio-line)] bg-black/20"
                  )}
                >
                  {referenceUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={referenceUrl}
                      alt="Reference"
                      className="h-20 w-14 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-14 items-center justify-center rounded-lg bg-black/40 text-[var(--studio-mute)]">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      value={referenceUrl}
                      onChange={(e) => setReferenceUrl(e.target.value)}
                      placeholder="Paste image URL or use “Send to video” from a result"
                      className="w-full rounded-lg border border-[var(--studio-line)] bg-black/35 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[var(--studio-teal)]"
                    />
                    {referenceUrl ? (
                      <button
                        type="button"
                        onClick={() => setReferenceUrl("")}
                        className="text-[11px] text-[var(--studio-mute)] underline-offset-2 hover:underline"
                      >
                        Clear reference
                      </button>
                    ) : (
                      <p className="text-[11px] text-[var(--studio-mute)]">
                        Generate in Image mode, then click{" "}
                        <span className="text-[var(--studio-teal)]">
                          Send to video
                        </span>
                        .
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {model?.requiresAudio ? (
              <div className="mt-4">
                <Field label="Audio URL (required)">
                  <input
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                    placeholder="https://…/voice.mp3"
                    className="studio-select w-full"
                  />
                </Field>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy || prompt.trim().length < 3}
                onClick={() => void onGenerate()}
                className={cn(
                  "relative inline-flex items-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-semibold text-black transition",
                  "bg-[var(--studio-amber)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40",
                  busy && "studio-sweep"
                )}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {busy ? "Generating…" : `Generate ${mode}`}
              </button>
              {phase !== "idle" && statusLabel ? (
                <span className="text-xs text-[var(--studio-mute)]">
                  {busy ? (
                    <span className="studio-pulse inline-block">●</span>
                  ) : null}{" "}
                  {statusLabel}
                </span>
              ) : null}
            </div>

            {error ? (
              <p className="mt-4 rounded-xl border border-[var(--studio-rose)]/40 bg-[rgba(232,120,106,0.1)] px-3 py-2 text-sm text-[var(--studio-rose)]">
                {error}
              </p>
            ) : null}
          </section>

          <aside className="studio-enter flex flex-col gap-3">
            <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-[var(--studio-line)] bg-black/50">
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-[var(--studio-line)] bg-black/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[var(--studio-mute)]">
                <span>Stage</span>
                <span>{resultKind ?? "empty"}</span>
              </div>

              {resultUrl && resultKind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resultUrl}
                  alt="Generated"
                  className="h-full min-h-[320px] w-full object-cover pt-8"
                />
              ) : resultUrl && resultKind === "video" ? (
                <video
                  src={resultUrl}
                  controls
                  className="h-full min-h-[320px] w-full bg-black object-contain pt-8"
                />
              ) : (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="studio-pulse rounded-full border border-[var(--studio-line)] p-4 text-[var(--studio-amber)]">
                    <Clapperboard className="h-7 w-7" />
                  </div>
                  <p className="display text-lg font-bold">Awaiting first frame</p>
                  <p className="text-xs text-[var(--studio-mute)]">
                    Results land here. Images get a one-tap handoff into video.
                  </p>
                </div>
              )}
            </div>

            {resultUrl && resultKind === "image" ? (
              <button
                type="button"
                onClick={() => useImageForVideo(resultUrl)}
                className="group flex items-center justify-between rounded-2xl border border-[var(--studio-teal)]/40 bg-[rgba(62,207,191,0.12)] px-4 py-3 text-left transition hover:bg-[rgba(62,207,191,0.2)]"
              >
                <span>
                  <span className="display block text-sm font-bold text-[var(--studio-teal)]">
                    Send to video gen
                  </span>
                  <span className="text-[11px] text-[var(--studio-mute)]">
                    Keeps this still · pick Kling, Veo, Seedance…
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 text-[var(--studio-teal)] transition group-hover:translate-x-0.5" />
              </button>
            ) : null}

            {resultUrl ? (
              <a
                href={resultUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-[var(--studio-line)] px-3 py-2 text-center text-xs text-[var(--studio-mute)] hover:text-[var(--studio-cream)]"
              >
                Open result in new tab
              </a>
            ) : null}

            <div className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-panel)]/80 p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--studio-mute)]">
                Session reel
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-[var(--studio-mute)]">
                  Generations from this visit show up here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.map((item) => (
                    <li
                      key={item.id + String(item.at)}
                      className="flex gap-2 rounded-lg border border-[var(--studio-line)] bg-black/30 p-2"
                    >
                      {item.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt=""
                          className="h-12 w-9 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-9 items-center justify-center rounded bg-black/50">
                          <Film className="h-4 w-4 text-[var(--studio-rose)]" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {item.modelLabel}
                        </p>
                        <p className="truncate text-[10px] text-[var(--studio-mute)]">
                          {item.prompt}
                        </p>
                        {item.kind === "image" ? (
                          <button
                            type="button"
                            onClick={() => useImageForVideo(item.url)}
                            className="mt-1 text-[10px] font-semibold text-[var(--studio-teal)] hover:underline"
                          >
                            Use for video
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  tone,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  tone: "teal" | "rose";
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const color = tone === "teal" ? "var(--studio-teal)" : "var(--studio-rose)";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "display flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition",
        active
          ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          : "border-[var(--studio-line)] text-[var(--studio-mute)] hover:bg-white/[0.03]"
      )}
      style={
        active
          ? {
              borderColor: `${color}66`,
              background: `${color}22`,
              color,
            }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-mute)]">
        {label}
      </span>
      {children}
    </label>
  );
}
