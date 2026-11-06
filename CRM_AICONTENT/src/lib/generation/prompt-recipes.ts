/**
 * Per-model prompt languages — one recipe each, never mixed.
 * Sources: Alibaba Wan docs, BytePlus Seedance, Kling, Google Veo/Gemini,
 * PixVerse, MiniMax H3/Hailuo, Grok Imagine, Vidu Q4 community + vendor guides.
 */

export type PromptRecipeKind = "video" | "image";

export interface PromptRecipe {
  id: string;
  kind: PromptRecipeKind;
  label: string;
  /** Short name of the formula this model prefers */
  formulaName: string;
  /** Ordered structure the enhancer must follow */
  structure: string[];
  /** System instructions for the enhancer LLM — model-specific only */
  systemPrompt: string;
  /** Deterministic fallback if the LLM is unavailable */
  fallbackExpand: (userText: string, ctx: RecipeContext) => string;
}

export type ClothingMode = "model" | "source" | "external";

export interface RecipeContext {
  modelName?: string | null;
  refLabels?: string[];
  hasImage?: boolean;
  /** Recreate: a source still is the composition driver */
  hasSourceImage?: boolean;
  keepPose?: boolean;
  durationSec?: number | null;
  aspect?: string | null;
  presetHint?: string | null;
  mode?: "presets" | "recreate" | "free";
  clothing?: ClothingMode | null;
}

export function clothingInstruction(ctx: RecipeContext): string {
  switch (ctx.clothing) {
    case "source":
      return "Keep the exact clothing, outfit, and accessories from the SOURCE image.";
    case "external":
      return "Dress the subject in the EXTERNAL clothing reference image; ignore source/model outfits.";
    case "model":
      return "Dress the subject using clothing/style consistent with the My Model identity references (not the source outfit).";
    default:
      return "";
  }
}

export function recreateFallback(userText: string, ctx: RecipeContext): string {
  const name = ctx.modelName?.trim() || "the subject";
  const pose = ctx.keepPose !== false
    ? "Match the SOURCE image pose, body position, camera angle, framing, and composition exactly."
    : "Keep the SOURCE scene and setting; pose may adjust slightly.";
  const clothes = clothingInstruction(ctx);
  const extra = userText.replace(/@[a-zA-Z0-9_-]+/g, "").trim();
  return joinParts(
    `Recreate the SOURCE image as a photoreal still.`,
    pose,
    `Replace the person with ${name}: keep ${name}'s exact face, age, hair, skin tone, and body from the identity reference images — do not invent a different person.`,
    clothes,
    extra ? `Extra direction: ${extra}.` : "Do not invent a new scene, location, or background — stay faithful to the SOURCE.",
    "Sharp face detail, natural skin, coherent lighting matching the source."
  );
}

function identityLine(ctx: RecipeContext): string {
  if (!ctx.modelName?.trim()) return "";
  const name = ctx.modelName.trim();
  if (ctx.hasImage) {
    return `Featuring ${name} as the sole subject. Keep ${name}'s exact face, age, hair, skin tone, and body from the reference images — do not invent a different person, do not age or youth-ify them. Only change wardrobe, pose, and scene as directed.`;
  }
  return `Featuring ${name} as the sole subject, matching reference identity and facial likeness.`;
}

function refsLine(ctx: RecipeContext): string {
  if (ctx.refLabels?.length) {
    return `Use uploaded references ${ctx.refLabels.join(", ")} where tagged.`;
  }
  return "";
}

function joinParts(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

const HYPERREAL_NEG =
  "Avoid: warped hands, morphing face, extra fingers, flicker, watermark, cartoon, plastic skin, oversharpened AI look.";

/** Default image recipe when model has no dedicated entry */
const IMAGE_DEFAULT: PromptRecipe = {
  id: "_image-default",
  kind: "image",
  label: "Image (general)",
  formulaName: "Subject + Scene + Light + Style",
  structure: ["subject", "scene", "lighting", "style", "quality"],
  systemPrompt: `You rewrite short human image prompts into clear photoreal still prompts for character-consistent generation.
When a named talent and reference images are provided, the subject MUST stay that exact person (same face, age, hair). Never invent a different age/ethnicity/appearance from the scene. Scene and wardrobe may change; identity may not.
Structure: identity lock → scene/action → lighting → style → quality. Keep under 90 words. No camera moves. Return ONLY the prompt.`,
  fallbackExpand: (userText, ctx) =>
    ctx.mode === "recreate" || ctx.hasSourceImage
      ? recreateFallback(userText, ctx)
      : joinParts(
          identityLine(ctx),
          userText
            ? `Creative direction: ${userText.replace(/@[a-zA-Z0-9_-]+/g, "").trim()}.`
            : "Tasteful lifestyle portrait, vertical framing.",
          "Photoreal, clean lighting, sharp facial detail, natural skin texture.",
          refsLine(ctx)
        ),
};

const VIDEO_RECIPES: Record<string, PromptRecipe> = {
  "wan-3-0": {
    id: "wan-3-0",
    kind: "video",
    label: "Wan 3.0",
    formulaName: "Entity + Scene + Motion + Aesthetic + Style (+ Sound)",
    structure: [
      "entity",
      "scene",
      "motion",
      "aesthetic_control",
      "stylization",
      "sound",
      "negative",
    ],
    systemPrompt: `You are a Wan 3.0 video prompt engineer (Alibaba Wan formula).
Rewrite the user's short idea into ONE continuous photoreal clip using EXACTLY this order:
1) Entity (appearance details)
2) Scene (environment details)
3) Motion (one continuous action + speed/weight)
4) Aesthetic control (shot size, ONE camera move, lens mm, lighting source/direction)
5) Stylization (photoreal / film stock / grade)
6) Optional sound (ambience/SFX only if useful)
7) End with a short negative list

Rules for Wan hyperreal:
- 60–120 words
- ONE subject, ONE action chain, ONE camera move
- Prefer: slow push-in / tracking / orbit / locked-off, 35–85mm, shallow DoF, natural skin, subtle film grain, motivated real-world light
- Never stack empty words like "cinematic, 8K, masterpiece"
- If image-to-video context is given, do NOT re-describe the still — focus on motion + camera + light change
- Return ONLY the final prompt text`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        "Photoreal live-action, natural skin texture, subtle 35mm film grain.",
        identityLine(ctx),
        userText || "A person standing in soft natural light.",
        "One continuous action with natural weight and timing.",
        "Medium shot, 50mm, shallow depth of field, slow push-in, motivated window light from camera-left.",
        ctx.hasImage
          ? "Keep identity and wardrobe locked to the source still; animate motion only."
          : "",
        "Quiet natural ambience, no music.",
        HYPERREAL_NEG,
        refsLine(ctx)
      ),
  },

  "wan-3-prime": {
    id: "wan-3-prime",
    kind: "video",
    label: "Wan 3.0 Prime",
    formulaName: "Entity + Scene + Motion + Aesthetic + Style (fast cutdown)",
    structure: [
      "entity",
      "scene",
      "motion",
      "aesthetic_control",
      "stylization",
      "negative",
    ],
    systemPrompt: `You are a Wan 3.0 Prime video prompt engineer.
Same Alibaba Wan formula as Wan 3.0 (Entity + Scene + Motion + Aesthetic + Style), but keep it SHORT and punchy for fast cutdowns (45–80 words).
ONE subject, ONE action, ONE camera move. Photoreal. Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        "Photoreal, natural light, clean grade.",
        identityLine(ctx),
        userText || "Subject in a simple real-world scene.",
        "One clear action. Medium shot, slow push-in, 50mm.",
        HYPERREAL_NEG,
        refsLine(ctx)
      ),
  },

  "seedance-2-5": {
    id: "seedance-2-5",
    kind: "video",
    label: "Seedance 2.5",
    formulaName: "Subject+Action → Scene → Style → Camera/Cuts → Sound",
    structure: ["subject_action", "scene", "style", "camera", "sound"],
    systemPrompt: `You are a ByteDance Seedance 2.5 prompt engineer.
Write an engineering-style instruction in this EXACT order:
1) Subject + action (body-part verbs, speed/force)
2) Scene / environment / time of day
3) Visual style
4) Camera movement / shot cuts (ONE move per shot; use Shot 1 / Shot 2 if multi-beat)
5) Sound in plain language

Separate camera motion from subject motion in different clauses.
Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        userText || "Subject walks forward slowly.",
        "Real-world environment, natural daylight.",
        "Photoreal social-video look.",
        "Shot 1: medium shot, slow push-in; subject action only — camera does not compete.",
        "Soft ambience, no loud score.",
        refsLine(ctx)
      ),
  },

  "seedance-2-0": {
    id: "seedance-2-0",
    kind: "video",
    label: "Seedance 2.0",
    formulaName: "Subject+Action → Scene → Style → Camera → Sound",
    structure: ["subject_action", "scene", "style", "camera", "sound"],
    systemPrompt: `You are a ByteDance Seedance 2.0 prompt engineer.
Order: subject+action → scene → style → one camera move → sound.
Keep one shot unless the user asks for cuts. Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        userText || "Subject moves naturally in frame.",
        "Everyday environment, soft daylight.",
        "Photoreal.",
        "Locked-off or slow tracking — pick one.",
        refsLine(ctx)
      ),
  },

  "kling-4-0": {
    id: "kling-4-0",
    kind: "video",
    label: "Kling 4.0",
    formulaName: "Subject + Movement + Scene + (Camera + Light + Atmosphere)",
    structure: ["subject", "movement", "scene", "camera", "lighting", "atmosphere"],
    systemPrompt: `You are a Kling 4.0 prompt engineer.
Formula: Subject (with one distinctive detail) + Subject movement (sequential verbs) + Scene + Camera language + Lighting + Atmosphere.
Rules: ONE camera move per shot; describe motion as verbs not adjectives; avoid empty "cinematic/8K".
If multi-shot is useful, label Shot 1 / Shot 2 explicitly.
Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        userText || "Subject turns toward camera.",
        "Real interior or exterior with clear depth.",
        "Medium shot, slow push-in on a 50mm lens.",
        "Soft directional window light, subtle atmosphere.",
        "Muted filmic grade.",
        refsLine(ctx)
      ),
  },

  "kling-3-0": {
    id: "kling-3-0",
    kind: "video",
    label: "Kling 3.0",
    formulaName: "Subject + Movement + Scene + Camera + Light + Atmosphere",
    structure: ["subject", "movement", "scene", "camera", "lighting", "atmosphere"],
    systemPrompt: `You are a Kling 3.0 prompt engineer.
Same Kling formula: Subject + Movement + Scene + (Camera + Lighting + Atmosphere).
Strong subject hold — keep identity consistent. One camera move. Sequential action verbs.
Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        userText || "Subject holds a natural pose then makes one clear move.",
        "Medium shot, locked or slow tracking — one only.",
        "Soft key light, stable exposure.",
        refsLine(ctx)
      ),
  },

  "kling-3-turbo": {
    id: "kling-3-turbo",
    kind: "video",
    label: "Kling 3.0 Turbo",
    formulaName: "Subject + Action + Scene + One camera move",
    structure: ["subject", "action", "scene", "camera"],
    systemPrompt: `You are a Kling 3.0 Turbo prompt engineer for fast iteration.
Keep prompts SHORT (40–70 words): subject + one action + scene + one camera move + light.
Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        userText || "Subject makes one clear motion.",
        "Simple scene, soft light, medium shot slow push-in.",
        refsLine(ctx)
      ),
  },

  "kling-3-motion": {
    id: "kling-3-motion",
    kind: "video",
    label: "Kling 3.0 Motion Control",
    formulaName: "Still identity + motion intent (reference-driven)",
    structure: ["identity_lock", "motion_intent", "camera_lock", "style"],
    systemPrompt: `You are a Kling 3.0 Motion Control prompt engineer.
The motion comes mainly from a motion reference; the prompt should LOCK identity from the still and describe allowed motion style, camera stability, and look.
Do not invent a full unrelated storyboard. Keep short. Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        "Keep face, body proportions, and wardrobe locked to the source still.",
        userText || "Follow the motion reference with natural weight transfer.",
        "Stable camera unless the reference implies otherwise.",
        refsLine(ctx)
      ),
  },

  "grok-imagine-video": {
    id: "grok-imagine-video",
    kind: "video",
    label: "Grok Imagine Video 1.5",
    formulaName: "Director sentences (no negatives)",
    structure: ["subject", "action", "setting", "camera", "lighting_mood", "sound"],
    systemPrompt: `You are a Grok Imagine Video 1.5 prompt engineer.
Write natural director-style SENTENCES (not keyword lists): subject → action → setting → camera → lighting/mood → sound.
Rules: one subject, one action, one camera move. NEVER use negative prompts (Grok ignores them) — describe what you WANT instead.
If image-to-video: describe ONLY motion/camera/atmosphere, do not re-describe the still.
Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        ctx.hasImage
          ? `Animate the source frame. ${userText || "Natural subtle motion."} Slow push-in, soft natural light, quiet ambience.`
          : `${userText || "A person in a real scene."} Slow push-in, golden-hour light, soft ambience.`,
        refsLine(ctx)
      ),
  },

  "gemini-omni-flash": {
    id: "gemini-omni-flash",
    kind: "video",
    label: "Gemini Omni 1.1 Flash",
    formulaName: "[Cinematography] + [Subject] + [Action] + [Context] + [Style] + audio",
    structure: ["cinematography", "subject", "action", "context", "style", "audio"],
    systemPrompt: `You are a Google Gemini Omni / Veo-family prompt engineer.
Use: [Cinematography] + [Subject] + [Action] + [Context] + [Style & ambiance], then audio cues.
One focused scene for short clips. For speech use a colon, not quotation marks when possible.
Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        "Medium shot, eye-level, slow dolly-in.",
        identityLine(ctx),
        userText || "Subject performs one clear action.",
        "Real-world setting, soft ambient light, photoreal.",
        "Ambient room tone, no subtitles.",
        refsLine(ctx)
      ),
  },

  "veo-3-1": {
    id: "veo-3-1",
    kind: "video",
    label: "Veo 3.1",
    formulaName: "[Cinematography] + [Subject] + [Action] + [Context] + [Style] + audio",
    structure: ["cinematography", "subject", "action", "context", "style", "audio"],
    systemPrompt: `You are a Google Veo 3.1 prompt engineer.
Formula: [Cinematography] + [Subject] + [Action] + [Context] + [Style & ambiance].
Include dialogue/SFX/ambient explicitly when needed. One scene per short clip. Prefer colon for speech. Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        "Close-up with shallow depth of field, gentle push-in.",
        identityLine(ctx),
        userText || "Subject acts with clear intent.",
        "Detailed environment, motivated lighting, photoreal film look.",
        "SFX: soft ambient detail. No subtitles.",
        refsLine(ctx)
      ),
  },

  "minimax-h3": {
    id: "minimax-h3",
    kind: "video",
    label: "MiniMax H3",
    formulaName: "Opening → Action → Camera → Ending → Sound",
    structure: [
      "format",
      "opening",
      "action",
      "camera",
      "ending",
      "soundscape",
    ],
    systemPrompt: `You are a MiniMax H3 / Hailuo prompt engineer.
Structure: format (live-action…) → opening composition → one observable action → one camera move → ending state → sound (ambience/SFX/dialogue).
Native stereo audio matters — always specify sound. Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        "Live-action cinematic clip.",
        identityLine(ctx),
        userText || "Subject completes one readable action.",
        "Slow dolly-in, settle on a clean ending frame.",
        "Stereo sound: natural ambience and physical SFX, no loud score.",
        refsLine(ctx)
      ),
  },

  "happyhorse-1-1": {
    id: "happyhorse-1-1",
    kind: "video",
    label: "HappyHorse 1.1",
    formulaName: "Subject + Punchy action + Light + One camera move",
    structure: ["subject", "action", "lighting", "camera"],
    systemPrompt: `You are a HappyHorse 1.1 social-motion prompt engineer.
Keep it punchy and short (35–70 words): subject + snappy action + punchy lighting + one camera move.
Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        userText || "Subject hits one energetic beat.",
        "Punchy directional light, high contrast, medium shot with a quick push-in.",
        refsLine(ctx)
      ),
  },

  "vidu-q4": {
    id: "vidu-q4",
    kind: "video",
    label: "Vidu Q4",
    formulaName: "Action + Camera + Audio (I2V — do not re-describe still)",
    structure: ["action", "camera", "dialogue_audio", "constraints"],
    systemPrompt: `You are a Vidu Q4 image-to-video prompt engineer.
The still already defines the frame. Prompt ONLY: action → camera → optional dialogue/audio → constraints (no subtitles, etc.).
Never re-describe wardrobe/room already in the image. Match duration to one beat. Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        userText || "Subject makes a small natural motion.",
        "Camera slowly pushes in. Soft room tone, no music, no subtitles.",
        "Keep face, logo, and product shape fixed.",
        refsLine(ctx)
      ),
  },

  "pixverse-v6-max": {
    id: "pixverse-v6-max",
    kind: "video",
    label: "PixVerse V6 Max",
    formulaName: "2–3 sentences / ~50–80 words",
    structure: ["subject_action_scene", "camera_light_style", "consistency"],
    systemPrompt: `You are a PixVerse V6 Max prompt engineer.
Write 2–3 short sentences (~50–80 words):
1) Subject + one action + scene
2) ONE camera move + concrete lighting/mood (never vague "cinematic")
3) Consistency notes if needed
Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        userText || "A subject moves through a clear scene.",
        "Slow push-in, golden-hour backlight, soft contrast, photoreal grade.",
        "Natural movement, stable face, consistent lighting.",
        refsLine(ctx)
      ),
  },

  "omnihuman-2-0": {
    id: "omnihuman-2-0",
    kind: "video",
    label: "OmniHuman 2.0",
    formulaName: "Talking performance from image + audio",
    structure: ["identity_lock", "performance", "camera", "look"],
    systemPrompt: `You are an OmniHuman 2.0 prompt engineer.
Audio drives length/lip-sync. Prompt should lock identity from the still and describe performance (expression, head motion), camera stability, and look.
Do not invent long scene changes. Return ONLY the prompt.`,
    fallbackExpand: (userText, ctx) =>
      joinParts(
        identityLine(ctx),
        "Keep likeness locked to the source still while speaking to camera.",
        userText || "Natural talking-head performance, subtle head motion.",
        "Mostly locked-off medium close-up, soft beauty light.",
        refsLine(ctx)
      ),
  },
};

const IMAGE_RECIPES: Record<string, PromptRecipe> = {
  "nano-banana-pro": {
    ...IMAGE_DEFAULT,
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    systemPrompt: `You rewrite prompts for Google Nano Banana Pro stills with reference identity images attached.
CRITICAL: Keep the named talent's exact face/age/hair from the references. Do not invent an older or younger person from scene stereotypes (e.g. "farm" must NOT become elderly).
Structure: identity lock → scene/wardrobe → light → style. Under 80 words. Return ONLY the prompt.`,
  },
  "nano-banana-2-1": {
    ...IMAGE_DEFAULT,
    id: "nano-banana-2-1",
    label: "Nano Banana 2.1",
  },
  "nano-banana": {
    ...IMAGE_DEFAULT,
    id: "nano-banana",
    label: "Nano Banana",
  },
  "gpt-image-2": {
    ...IMAGE_DEFAULT,
    id: "gpt-image-2",
    label: "GPT Image 2",
    systemPrompt: `You rewrite prompts for GPT Image models.
Be literal and composition-faithful; good with text-in-image if asked.
Subject → composition → light → style. Return ONLY the prompt.`,
  },
  "gpt-image-2-5": {
    ...IMAGE_DEFAULT,
    id: "gpt-image-2-5",
    label: "GPT Image 2.5",
  },
  "seedream-5-pro": {
    ...IMAGE_DEFAULT,
    id: "seedream-5-pro",
    label: "Seedream 5.0 Pro",
    systemPrompt: `You rewrite prompts for Seedream photoreal ads/thumbnails.
Strong subject, punchy lighting, clear brand-safe composition. Return ONLY the prompt.`,
  },
  "seedream-5-flash": {
    ...IMAGE_DEFAULT,
    id: "seedream-5-flash",
    label: "Seedream 5.0 Flash",
  },
  "seedream-4-5": {
    ...IMAGE_DEFAULT,
    id: "seedream-4-5",
    label: "Seedream 4.5",
  },
  "flux-3-klein": {
    ...IMAGE_DEFAULT,
    id: "flux-3-klein",
    label: "Flux 3 Klein",
    systemPrompt: `You rewrite prompts for Flux — crisp graphic control.
Clear subject, composition, style keywords that are concrete. Return ONLY the prompt.`,
  },
};

export function getPromptRecipe(modelId: string | null | undefined): PromptRecipe {
  if (!modelId) return IMAGE_DEFAULT;
  return (
    VIDEO_RECIPES[modelId] ??
    IMAGE_RECIPES[modelId] ??
    (modelId.includes("video") || modelId.includes("kling") || modelId.includes("wan")
      ? VIDEO_RECIPES["wan-3-0"]
      : IMAGE_DEFAULT)
  );
}

export function listVideoRecipeIds(): string[] {
  return Object.keys(VIDEO_RECIPES);
}
