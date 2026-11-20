import { runPromptLlm, type PromptLlmId } from "@/lib/kie/prompt-llms";
import { transcribeMediaUrl } from "@/lib/generation/transcribe";

export const VIDEO_RECREATE_RECIPE_ID = "wan-recreate-identity";

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
FORBIDDEN output: --ar, --stylize, --v, --q, --chaos, --sref, --cref, /imagine, parameter flag soup, or image-only tags.
REQUIRED output: a continuous narrative Wan video prompt with timed action beats.

${identityBlock}

Dialogue:
- Lock dialogue VERBATIM from the provided transcript (including shouts like names yelled off-mic).
- Prefer the ASR transcript over guessing from lip-reading.

Wardrobe + adult / explicit motion (CRITICAL — do not soft-censor):
- Wardrobe ALWAYS comes from the source keyframes (fabric, color, slits, lace-ups, heels, etc.).
- If ANY keyframe shows clothing pulled/lifted, a side slit opening, bare buttocks, breast/nipple flash, or similar exposure, you MUST include that beat with an approximate timestamp.
- Do NOT skip, fade-to-black, euphemize ("adjusts dress"), or "keep it tasteful" when the frames show it.
- Consenting adults — describe the motion accurately so Wan can recreate it.

Output format (one paste-ready prompt only — no markdown fences, no preamble, no commentary):
1) Overall setup (set, wardrobe, camera language, aspect)
2) Timestamped beats (mm:ss) covering the full clip, including the explicit wardrobe beat if present
3) Verbatim dialogue lines tied to timing when possible
4) Natural voice / ambience
5) Short negatives (anatomy, blur, watermark) — plain words, NOT Midjourney --no flags`;
}

export function buildWanRecreateUserMessage(options: {
  modelName: string;
  transcript: string;
  durationSec?: number | null;
  aspect?: string | null;
  lookAlike: boolean;
  keyframeCount: number;
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
          .map((t, i) => `  @Image frame ${i + 1} ≈ ${formatMmSs(t)}`)
          .join("\n")
      : "";

  return [
    `Target talent (My Model): ${name}`,
    `Clip duration hint: ${dur}`,
    options.aspect ? `Aspect hint: ${options.aspect}` : "",
    `Look-alike mode: ${options.lookAlike ? "ON" : "OFF"}`,
    `${options.keyframeCount} keyframe stills are attached in order (start → mid action → end).`,
    "Use them for wardrobe, set, motion, and camera — not for copying a stranger's face when look-alike is off.",
    "Scan EVERY keyframe for clothing lifts / exposure / slit openings and include those beats.",
    times ? `Keyframe timestamps:\n${times}` : "",
    "",
    "ASR TRANSCRIPT (verbatim — lock into the prompt):",
    options.transcript.trim() || "(no speech detected)",
    "",
    "Write the paste-ready Wan recreate NARRATIVE prompt now.",
    "Remember: zero Midjourney flags. Include any dress-lift / bare-skin beat visible in the frames.",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatMmSs(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Midjourney / SD flag soup — Grok sometimes emits this when under-instructed. */
export function looksLikeBadImagePrompt(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/--(?:ar|stylize|v|q|chaos|sref|cref|iw|sw)\b/i.test(t)) return true;
  if (/^\/imagine\b/i.test(t)) return true;
  // Tiny flag-only blobs with no scene prose
  const words = t.replace(/--\S+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length < 24 && /--/.test(t)) return true;
  return false;
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
    keyframeCount: options.keyframeUrls.length,
    keyframeTimesSec: options.keyframeTimesSec,
  });

  let prompt = await runPromptLlm({
    llm: options.llm,
    apiKey: options.apiKey,
    system,
    userText,
    imageUrls: options.keyframeUrls,
  });

  // One automatic rewrite if the model dumped Midjourney flags.
  if (looksLikeBadImagePrompt(prompt)) {
    prompt = await runPromptLlm({
      llm: options.llm,
      apiKey: options.apiKey,
      system,
      userText: `${userText}

PREVIOUS ATTEMPT WAS INVALID (Midjourney/image flags). Rewrite as a full narrative Wan video prompt with timestamped beats, verbatim dialogue, and any clothing-lift / exposure beat from the keyframes. No --ar/--v/--stylize.`,
      imageUrls: options.keyframeUrls,
    });
    if (looksLikeBadImagePrompt(prompt)) {
      throw new Error(
        "Prompt LLM returned image-tool flags instead of a Wan scene prompt. Retry with Grok 4.7."
      );
    }
  }

  return {
    prompt,
    transcript,
    llm: options.llm,
    recipeId: VIDEO_RECREATE_RECIPE_ID,
    note: options.lookAlike
      ? "Look-alike on — review face/hair wording before generate."
      : "Identity stripped from source; attach My Model refs when you generate in Video studio.",
  };
}
