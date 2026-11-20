import { runPromptLlm, type PromptLlmId } from "@/lib/kie/prompt-llms";
import { transcribeMediaUrl } from "@/lib/generation/transcribe";
import { videoNoTextRule } from "@/lib/generation/prompt-recipes";

export const VIDEO_RECREATE_RECIPE_ID = "wan-recreate-identity";

const EXPOSURE_RE =
  /\b(bare|butt|buttock|ass|cheek|lift|pulled\s*up|hike|slit\s*open|expos|flash|nude|naked|no\s*panty|without\s*pant|underwear|thong|breast|nipple|crotch|side\s*angle)\b/i;

const INVENTORY_BATCH = 6;

function formatMmSs(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const frac = Math.round((s % 1) * 10);
  if (frac > 0) {
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}.${frac}`;
  }
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function buildInventorySystemPrompt(): string {
  return `You inventory source-video keyframes for a Wan recreate pipeline that must EXACTLY copy the clip's action.

For EACH attached image, output exactly one line:
FRAME n @ mm:ss | wardrobe: … | exposure: none OR describe exactly (e.g. "black dress pulled up at side slit, bare left buttock visible from side") | pose/motion: … | set: …

Rules:
- Cover what is literally visible in THAT frame — do not skip or soften.
- Do NOT soft-censor. If skin/buttocks/breasts/clothing lift is visible, say so plainly.
- Do NOT describe face, hair color, ethnicity, or body type (identity comes from My Model later).
- Wardrobe fabric/color/cut/slits/lace-ups matter.
- IGNORE burned-in captions / meme overlays / \"Wait for it…\" / subtitles / stickers / watermarks — never copy that text into wardrobe or set. If present, write overlay_text: ignore.
- Use the FRAME numbers and timestamps given in the user message (do not renumber from 1 unless told).
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

  return `You are writing a ${options.videoModelLabel} VIDEO recreate prompt for AiInstaReels — goal: EXACT copy of the source clip's choreography, wardrobe, camera, and dialogue (with My Model identity).

This is NOT Midjourney, NOT Stable Diffusion, NOT an image prompt.
FORBIDDEN output: --ar, --stylize, --v, --q, --chaos, --sref, --cref, /imagine, parameter flag soup.
REQUIRED: continuous narrative Wan video prompt with dense timestamped beats covering the FULL clip.

${identityBlock}

Dialogue:
- Lock dialogue VERBATIM from the provided transcript.
- Prefer the ASR transcript over lip-reading guesses.

Full-timeline inventory (CRITICAL):
- You receive a dense KEYFRAME INVENTORY spanning the whole video.
- Turn it into continuous timestamped beats — do not jump over sections.
- Every FRAME line whose exposure is NOT "none" MUST appear as an explicit beat.
- Do not euphemize ("adjusts dress"). If inventory says bare buttock / dress pulled up / slit open — write that.
- Wardrobe always follows the inventory/source frames, never My Model clothes.

NO on-screen text (CRITICAL — product rule):
- NEVER write or recreate burned-in captions, meme overlays, \"Wait for it…\", subtitles, stickers, or watermarks from the source.
- Spoken lines are AUDIO / dialogue only — they must NOT appear as text on screen.
- Always end negatives with: no captions, no subtitles, no watermark, no text overlays, no meme text.

Output (one paste-ready prompt only — no markdown fences, no commentary):
1) Overall setup (set, wardrobe, camera, aspect, duration) — no overlay text
2) Dense timestamped beats (mm:ss) covering start → every action change → end
3) Verbatim dialogue tied to timing when possible (audio only)
4) Natural voice / ambience
5) Short negatives including no captions / no on-screen text`;
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
  const frameCount = options.keyframeTimesSec?.length ?? 0;

  return [
    `Target talent (My Model): ${name}`,
    `Clip duration hint: ${dur}`,
    options.aspect ? `Aspect hint: ${options.aspect}` : "",
    `Look-alike mode: ${options.lookAlike ? "ON" : "OFF"}`,
    frameCount
      ? `Dense timeline: ${frameCount} inventoried frames spanning the full clip.`
      : "",
    "",
    "KEYFRAME INVENTORY (full-clip source of truth — recreate EVERY beat, do not skip exposure lines):",
    options.inventory.trim() || "(empty)",
    "",
    "ASR TRANSCRIPT (verbatim — lock into the prompt):",
    options.transcript.trim() || "(no speech detected)",
    "",
    "Write the paste-ready Wan recreate NARRATIVE prompt now — exact choreography of the full video.",
    "Do NOT include any on-screen captions or overlay text from the source frames.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Strip accidental caption instructions and seal the no-text product rule. */
export function sealVideoNoText(prompt: string, userHint?: string): string {
  const cleaned = prompt
    .replace(/\bwait for it[.…]*\b/gi, " ")
    .replace(/\bon-?screen text[^.]*\./gi, " ")
    .replace(/\bburned-?in caption[^.]*\./gi, " ")
    .replace(/\smeme (caption|overlay|text)[^.]*\./gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const rule = videoNoTextRule(userHint);
  if (cleaned.toLowerCase().includes("no burned-in captions")) {
    return cleaned;
  }
  return `${cleaned} ${rule}`.replace(/\s+/g, " ").trim();
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
    const exp = /exposure:\s*(.+?)(?:\s*\|\s*(?:pose\/)?motion:|$)/i.exec(line);
    const val = (exp?.[1] ?? "").trim();
    if (!val || /^none\b/i.test(val)) return false;
    return EXPOSURE_RE.test(val);
  });
}

export function promptCoversExposure(prompt: string, inventory: string): boolean {
  if (!inventoryHasExposure(inventory)) return true;
  return EXPOSURE_RE.test(prompt);
}

function renumberFrameLines(
  text: string,
  startIndex: number,
  times: number[]
): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const frameLines = lines.filter((l) => /^FRAME\s+\d+/i.test(l));
  const source = frameLines.length ? frameLines : lines;
  return source.map((line, i) => {
    const globalIndex = startIndex + i + 1;
    const t = times[i];
    const stamp =
      typeof t === "number" ? formatMmSs(t) : `frame-${globalIndex}`;
    const rest = line.replace(/^FRAME\s+\d+\s*(?:@\s*[^\|]+)?\|?\s*/i, "");
    return `FRAME ${globalIndex} @ ${stamp} | ${rest}`;
  });
}

async function inventoryKeyframesBatched(options: {
  apiKey: string;
  llm: PromptLlmId;
  keyframeUrls: string[];
  keyframeTimesSec?: number[];
}): Promise<string> {
  const urls = options.keyframeUrls;
  const times = options.keyframeTimesSec ?? urls.map((_, i) => i);
  const allLines: string[] = [];

  for (let start = 0; start < urls.length; start += INVENTORY_BATCH) {
    const batchUrls = urls.slice(start, start + INVENTORY_BATCH);
    const batchTimes = times.slice(start, start + INVENTORY_BATCH);
    const mapping = batchTimes
      .map(
        (t, i) =>
          `Attached image ${i + 1} = FRAME ${start + i + 1} @ ${formatMmSs(t)}`
      )
      .join("\n");

    const text = await runPromptLlm({
      llm: options.llm,
      apiKey: options.apiKey,
      system: buildInventorySystemPrompt(),
      userText: `Inventory this batch of a dense full-clip timeline.

${mapping}

Output one FRAME line per image using the GLOBAL frame numbers and timestamps above. Be explicit about clothing lifts / bare skin / pose changes.`,
      imageUrls: batchUrls,
    });

    allLines.push(...renumberFrameLines(text, start, batchTimes));
  }

  return allLines.join("\n");
}

function pickVisionUrls(
  urls: string[],
  times: number[],
  inventory: string
): string[] {
  if (urls.length <= 10) return urls;

  const scores = urls.map((_, i) => {
    let score = Math.abs(i - urls.length / 2) < urls.length / 4 ? 10 : 0;
    // Prefer evenly spaced coverage as a base
    score += 1;
    void times;
    return score;
  });

  const boosted = new Set<number>();
  for (const line of inventory.split("\n")) {
    if (!EXPOSURE_RE.test(line) || /exposure:\s*none/i.test(line)) continue;
    const m = /^FRAME\s+(\d+)/i.exec(line);
    if (m) {
      const idx = Number(m[1]) - 1;
      if (idx >= 0 && idx < scores.length) {
        boosted.add(idx);
        scores[idx] += 1_000_000;
      }
    }
  }

  const chosen = new Set<number>([0, urls.length - 1]);
  const ranked = scores
    .map((score, i) => ({ i, score }))
    .filter((r) => r.i !== 0 && r.i !== urls.length - 1)
    .sort((a, b) => b.score - a.score);
  for (const r of ranked) {
    if (chosen.size >= 10) break;
    chosen.add(r.i);
  }
  for (const i of boosted) {
    if (chosen.size >= 10) break;
    chosen.add(i);
  }
  // Fill remaining with even grid
  const step = urls.length / 10;
  for (let k = 0; k < 10 && chosen.size < 10; k++) {
    chosen.add(Math.min(urls.length - 1, Math.round(k * step)));
  }

  return [...chosen]
    .sort((a, b) => a - b)
    .slice(0, 10)
    .map((i) => urls[i]);
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
  frameCount: number;
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

  const inventory = await inventoryKeyframesBatched({
    apiKey: options.apiKey,
    llm: options.llm,
    keyframeUrls: options.keyframeUrls,
    keyframeTimesSec: options.keyframeTimesSec,
  });

  const visionUrls = pickVisionUrls(
    options.keyframeUrls,
    options.keyframeTimesSec ?? [],
    inventory
  );

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
    imageUrls: visionUrls,
  });

  if (looksLikeBadImagePrompt(prompt)) {
    prompt = await runPromptLlm({
      llm: options.llm,
      apiKey: options.apiKey,
      system,
      userText: `${userText}

PREVIOUS ATTEMPT WAS INVALID (Midjourney/image flags). Rewrite as a full narrative Wan video prompt covering the entire inventory timeline. No --ar/--v/--stylize.`,
      imageUrls: visionUrls,
    });
    if (looksLikeBadImagePrompt(prompt)) {
      throw new Error(
        "Prompt LLM returned image-tool flags instead of a Wan scene prompt. Retry with Grok 4.7."
      );
    }
  }

  if (!promptCoversExposure(prompt, inventory)) {
    prompt = await runPromptLlm({
      llm: options.llm,
      apiKey: options.apiKey,
      system,
      userText: `${userText}

CRITICAL REWRITE: Your previous prompt omitted attention-grab exposure beat(s) already in the inventory:
${inventory
  .split("\n")
  .filter((l) => EXPOSURE_RE.test(l) && !/exposure:\s*none/i.test(l))
  .join("\n")}

Rewrite the FULL Wan prompt covering the entire clip and INCLUDE those beats with timestamps. Do not euphemize.`,
      imageUrls: visionUrls,
    });
  }

  return {
    prompt: sealVideoNoText(prompt),
    transcript,
    inventory,
    llm: options.llm,
    recipeId: VIDEO_RECREATE_RECIPE_ID,
    frameCount: options.keyframeUrls.length,
    note: options.lookAlike
      ? "Look-alike on — review face/hair wording before generate. No on-screen captions."
      : `Full-clip inventory (${options.keyframeUrls.length} frames). Identity stripped; no on-screen captions; attach My Model refs in Video studio.`,
  };
}
