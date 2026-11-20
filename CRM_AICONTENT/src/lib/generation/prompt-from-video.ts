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

  return `You are writing a ${options.videoModelLabel} recreate prompt for AiInstaReels.

${identityBlock}

Dialogue:
- Lock dialogue VERBATIM from the provided transcript (including shouts like names yelled off-mic).
- Prefer the ASR transcript over guessing from lip-reading.

Adult / explicit motion:
- If the source shows clothing lifted / body exposure, describe it accurately.
- Do not modestly rewrite or censor when the content is consenting adults.

Output:
- One paste-ready ${options.videoModelLabel} prompt only (no markdown fences, no commentary).
- Structure: overall setup → timestamped beats (mm:ss) → verbatim dialogue lines → natural voice/ambience → short negatives.
- Keep continuous single-clip energy suitable for Wan (prefer one camera language, clear motion).`;
}

export function buildWanRecreateUserMessage(options: {
  modelName: string;
  transcript: string;
  durationSec?: number | null;
  aspect?: string | null;
  lookAlike: boolean;
  keyframeCount: number;
}): string {
  const name = options.modelName.trim() || "My Model";
  const dur =
    typeof options.durationSec === "number" && options.durationSec > 0
      ? `${options.durationSec}s`
      : "unknown duration";
  return [
    `Target talent (My Model): ${name}`,
    `Clip duration hint: ${dur}`,
    options.aspect ? `Aspect hint: ${options.aspect}` : "",
    `Look-alike mode: ${options.lookAlike ? "ON" : "OFF"}`,
    `${options.keyframeCount} keyframe stills are attached in order (start → mid beats → end). Use them for wardrobe, set, motion, and camera — not for copying a stranger's face when look-alike is off.`,
    "",
    "ASR TRANSCRIPT (verbatim — lock into the prompt):",
    options.transcript.trim() || "(no speech detected)",
    "",
    "Write the paste-ready Wan recreate prompt now.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildPromptFromVideo(options: {
  apiKey: string;
  llm: PromptLlmId;
  sourceVideoUrl: string;
  modelName: string;
  videoModelLabel: string;
  lookAlike: boolean;
  keyframeUrls: string[];
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
  });

  const prompt = await runPromptLlm({
    llm: options.llm,
    apiKey: options.apiKey,
    system,
    userText,
    imageUrls: options.keyframeUrls,
  });

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
