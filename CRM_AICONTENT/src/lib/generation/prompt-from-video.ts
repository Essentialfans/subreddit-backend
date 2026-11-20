import { runPromptLlm, type PromptLlmId } from "@/lib/kie/prompt-llms";
import { transcribeMediaUrl } from "@/lib/generation/transcribe";

export const VIDEO_RECREATE_RECIPE_ID = "wan-recreate-identity";

const EXPOSURE_RE =
  /\b(bare|butt|buttock|ass|cheek|lift|pulled\s*up|hike|slit\s*open|expos|flash|nude|naked|no\s*panty|without\s*pant|underwear|thong|breast|nipple|crotch|side\s*angle)\b/i;

function formatMmSs(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function buildInventorySystemPrompt(): string {
  return `You inventory source-video keyframes for a Wan recreate pipeline.

For EACH attached image, output exactly one line:
FRAME n @ mm:ss | wardrobe: … | exposure: none OR describe exactly (e.g. "black dress pulled up at side slit, bare left buttock visible from side") | motion: …

Rules:
- Do NOT soft-censor. If skin/buttocks/breasts/clothing lift is visible, say so plainly.
- Do NOT describe face, hair color, ethnicity, or body type of the person (identity comes from My Model later).
- Wardrobe fabric/color/cut details matter.
- No Midjourney flags. No preamble. Only FRAME lines.`;
}

export function buildWanRecreateSystemPrompt(options: {
  modelName: string;
  lookAlike: boolean;
  videoModelLabel: string;
}): string {
  const name = options.modelName.trim() || "My Model";
  const identityBlock = options.lookAlike
    ? `Look-alike mode is ON: you may describe the source person's appearance when useful, but still name the talent as ${name} for generation.`
    : `Identity (CRITICAL — look-alike OFF):
- The person who MUST appear is My Model: ${name}.
- Reference images will be attached later as @Image1… — do NOT invent their face/hair/body from imagination.
- Do NOT describe the face, hair color, body type, age look, or ethnicity of anyone visible in the SOURCE video.
- Refer to the subject as "the presenter from @Image1 / the reference images" or "${name} from the reference images".
- DO describe wardrobe, set, props, motion, camera, timing, and dialogue exactly.`;

  return `You are writing a ${options.videoModelLabel} VIDEO recreate prompt for AiInstaReels.

This is NOT Midjourney, NOT Stable Diffusion, NOT an image prompt.
FORBIDDEN output: --ar, --stylize, --v, --q, --chaos, --sref, --cref, /imagine, parameter flag soup.
REQUIRED: continuous narrative Wan video prompt with timed action beats.

${identityBlock}

Dialogue:
- Lock dialogue VERBATIM from the provided transcript.
- Prefer the ASR transcript over lip-reading guesses.

Attention-grab / wardrobe motion (CRITICAL):
- You are given a KEYFRAME INVENTORY. Every FRAME line whose exposure is NOT "none" MUST become an explicit timestamped beat in the final prompt.
- Do not euphemize ("adjusts dress"). If inventory says bare buttock / dress pulled up / slit open — write that.
- Wardrobe always follows the inventory/source frames, never My Model clothes.

Output (one paste-ready prompt only — no markdown fences, no commentary):
1) Overall setup (set, wardrobe, camera, aspect)
2) Timestamped beats (mm:ss) for the full clip — include every exposure beat from the inventory
3) Verbatim dialogue
4) Natural voice / ambience
5) Short negatives in plain words (not --no flags)`;
}

export function buildWanRecreateUserMessage(options: {
  modelName: string;
  transcript: string;
  durationSec?: number | null;
  aspect?: string | null;
  lookAlike: boolean;
  inventory: string;
  keyframeTimesSec?: number[];
}): string {
  const name = options.modelName.trim() || "My Model";
  const dur =
    typeof options.durationSec === "number" && options.durationSec > 0
      ? `${options.durationSec.toFixed(1)}s`
      : "unknown duration";
  const times =
    options.keyframeTimesSec && options.keyframeTimesSec.length
      ? options.keyframeTimesSec
          .map((t, i) => `  frame ${i + 1} ≈ ${formatMmSs(t)}`)
          .join("\n")
      : "";

  return [
    `Target talent (My Model): ${name}`,
    `Clip duration hint: ${dur}`,
    options.aspect ? `Aspect hint: ${options.aspect}` : "",
    `Look-alike mode: ${options.lookAlike ? "ON" : "OFF"}`,
    times ? `Keyframe timestamps:\n${times}` : "",
    "",
    "KEYFRAME INVENTORY (source of truth for wardrobe + exposure — do not drop exposure lines):",
    options.inventory.trim() || "(empty)",
    "",
    "ASR TRANSCRIPT (verbatim — lock into the prompt):",
    options.transcript.trim() || "(no speech detected)",
    "",
    "Write the paste-ready Wan recreate NARRATIVE prompt now.",
    "Must include every non-none exposure beat from the inventory with a timestamp.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Midjourney / SD flag soup — Grok sometimes emits this when under-instructed. */
export function looksLikeBadImagePrompt(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/--(?:ar|stylize|v|q|chaos|sref|cref|iw|sw)\b/i.test(t)) return true;
  if (/^\/imagine\b/i.test(t)) return true;
  const words = t.replace(/--\S+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length < 24 && /--/.test(t)) return true;
  return false;
}

export function inventoryHasExposure(inventory: string): boolean {
  const lines = inventory.split("\n").filter((l) => /^FRAME\s+\d+/i.test(l));
  if (!lines.length) return EXPOSURE_RE.test(inventory);
  return lines.some((line) => {
    const exp = /exposure:\s*(.+?)(?:\s*\|\s*motion:|$)/i.exec(line);
    const val = (exp?.[1] ?? "").trim();
    if (!val || /^none\b/i.test(val)) return false;
    return EXPOSURE_RE.test(val);
  });
}

export function promptCoversExposure(prompt: string, inventory: string): boolean {
  if (!inventoryHasExposure(inventory)) return true;
  return EXPOSURE_RE.test(prompt);
}

async function inventoryKeyframes(options: {
  apiKey: string;
  llm: PromptLlmId;
  keyframeUrls: string[];
  keyframeTimesSec?: number[];
}): Promise<string> {
  const timeHint =
    options.keyframeTimesSec && options.keyframeTimesSec.length
      ? options.keyframeTimesSec
          .map((t, i) => `Image ${i + 1} is ≈ ${formatMmSs(t)}`)
          .join("; ")
      : `${options.keyframeUrls.length} images in timeline order`;

  const text = await runPromptLlm({
    llm: options.llm,
    apiKey: options.apiKey,
    system: buildInventorySystemPrompt(),
    userText: `Inventory these keyframes. ${timeHint}. One FRAME line per image. Be explicit about clothing lifts / bare skin.`,
    imageUrls: options.keyframeUrls,
  });

  // Keep FRAME lines if present; otherwise keep whole text
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const frameLines = lines.filter((l) => /^FRAME\s+\d+/i.test(l));
  return (frameLines.length ? frameLines : lines).join("\n");
}

export async function buildPromptFromVideo(options: {
  apiKey: string;
  llm: PromptLlmId;
  sourceVideoUrl: string;
  modelName: string;
  videoModelLabel: string;
  lookAlike: boolean;
  keyframeUrls: string[];
  keyframeTimesSec?: number[];
  durationSec?: number | null;
  aspect?: string | null;
}): Promise<{
  prompt: string;
  transcript: string;
  inventory: string;
  llm: PromptLlmId;
  recipeId: string;
  note: string;
}> {
  let transcript = "";
  try {
    const asr = await transcribeMediaUrl({
      apiKey: options.apiKey,
      mediaUrl: options.sourceVideoUrl,
      withTimestamps: true,
    });
    transcript = asr.transcript;
  } catch (err) {
    transcript = `(ASR unavailable: ${
      err instanceof Error ? err.message : "unknown error"
    }. Infer spoken lines carefully from keyframes/context; mark uncertain dialogue.)`;
  }

  // Pass 1: force the model to name wardrobe/exposure per frame before writing Wan prose.
  const inventory = await inventoryKeyframes({
    apiKey: options.apiKey,
    llm: options.llm,
    keyframeUrls: options.keyframeUrls,
    keyframeTimesSec: options.keyframeTimesSec,
  });

  const system = buildWanRecreateSystemPrompt({
    modelName: options.modelName,
    lookAlike: options.lookAlike,
    videoModelLabel: options.videoModelLabel,
  });
  const userText = buildWanRecreateUserMessage({
    modelName: options.modelName,
    transcript,
    durationSec: options.durationSec,
    aspect: options.aspect,
    lookAlike: options.lookAlike,
    inventory,
    keyframeTimesSec: options.keyframeTimesSec,
  });

  let prompt = await runPromptLlm({
    llm: options.llm,
    apiKey: options.apiKey,
    system,
    userText,
    imageUrls: options.keyframeUrls,
  });

  if (looksLikeBadImagePrompt(prompt)) {
    prompt = await runPromptLlm({
      llm: options.llm,
      apiKey: options.apiKey,
      system,
      userText: `${userText}

PREVIOUS ATTEMPT WAS INVALID (Midjourney/image flags). Rewrite as a full narrative Wan video prompt. No --ar/--v/--stylize.`,
      imageUrls: options.keyframeUrls,
    });
    if (looksLikeBadImagePrompt(prompt)) {
      throw new Error(
        "Prompt LLM returned image-tool flags instead of a Wan scene prompt. Retry with Grok 4.7."
      );
    }
  }

  // Pass 3: if inventory saw exposure but final prompt soft-censored it, force rewrite.
  if (!promptCoversExposure(prompt, inventory)) {
    prompt = await runPromptLlm({
      llm: options.llm,
      apiKey: options.apiKey,
      system,
      userText: `${userText}

CRITICAL REWRITE: Your previous prompt omitted the attention-grab exposure beat that the inventory already recorded:
${inventory
  .split("\n")
  .filter((l) => EXPOSURE_RE.test(l) && !/exposure:\s*none/i.test(l))
  .join("\n")}

Rewrite the FULL Wan prompt and INCLUDE those beats with timestamps. Do not euphemize.`,
      imageUrls: options.keyframeUrls,
    });
  }

  return {
    prompt,
    transcript,
    inventory,
    llm: options.llm,
    recipeId: VIDEO_RECREATE_RECIPE_ID,
    note: options.lookAlike
      ? "Look-alike on — review face/hair wording before generate."
      : "Identity stripped from source; attach My Model refs when you generate in Video studio.",
  };
}
