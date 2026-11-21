import {
  clothingInstruction,
  getPromptRecipe,
  recreateFaceKeepList,
  recreateFallback,
  recreateNoTextRule,
  type ClothingMode,
  type RecipeContext,
} from "@/lib/generation/prompt-recipes";
import { kieChatComplete } from "@/lib/kie/chat";

export interface PromptBuildInput {
  mode: "presets" | "recreate" | "free";
  userText: string;
  modelName?: string | null;
  /** Catalog id — selects the per-model recipe (wan-3-0, kling-4-0, …) */
  modelId?: string | null;
  presetHint?: string | null;
  enhanceWithAi: boolean;
  refLabels?: string[];
  keepPose?: boolean;
  hasImage?: boolean;
  hasSourceImage?: boolean;
  clothing?: ClothingMode | null;
  durationSec?: number | null;
  aspect?: string | null;
  /** Recreate always uses identity-first (My Model = image_urls[0]). */
  recreateImageOrder?: "identity-first" | "source-first";
  /** How many leading image_urls are My Model identity refs */
  identityRefCount?: number;
  /** 1-based index of the SOURCE image in image_urls */
  sourceImageIndex?: number;
  /** User's kie.ai key — required for live LLM enhance */
  kieApiKey?: string | null;
}

export interface PromptBuildResult {
  prompt: string;
  provider: "kie-chat" | "recipe-fallback" | "passthrough";
  recipeId: string;
  formulaName: string;
  note?: string;
}

function recipeContext(input: PromptBuildInput): RecipeContext {
  return {
    modelName: input.modelName,
    refLabels: input.refLabels,
    hasImage: input.hasImage,
    hasSourceImage: input.hasSourceImage ?? input.mode === "recreate",
    keepPose: input.keepPose,
    durationSec: input.durationSec,
    aspect: input.aspect,
    presetHint: input.presetHint,
    mode: input.mode,
    clothing: input.clothing,
    recreateImageOrder: input.recreateImageOrder,
    identityRefCount: input.identityRefCount,
    sourceImageIndex: input.sourceImageIndex,
  };
}

function buildUserMessage(input: PromptBuildInput, formulaName: string): string {
  const emptyRecreate =
    input.mode === "recreate" && !input.userText.trim()
      ? "(empty — do NOT invent a new scene; recreate the SOURCE image faithfully)"
      : "(empty — invent a tasteful default scene)";

  const bits = [
    `Target formula: ${formulaName}`,
    `User intent (human language): ${input.userText.trim() || emptyRecreate}`,
  ];
  if (input.modelName) bits.push(`Identity / talent name: ${input.modelName}`);
  if (input.hasImage) {
    bits.push(
      "Reference identity images ARE attached. Preserve that exact person's face, age, hair, and likeness. Never invent a different age from scene stereotypes."
    );
  }
  if (input.mode === "recreate" || input.hasSourceImage) {
    if (input.recreateImageOrder === "source-first") {
      bits.push(
        "RECREATE MODE (legacy source-first): Image 1 is SOURCE (pose/scene). Images 2+ are My Model identity (face+body). REPLACE the woman in Image 1 with the My Model from Images 2+."
      );
    } else {
      bits.push(
        "RECREATE MODE (identity-first / priority): Images 1+ are My Model identity — KEEP that exact face and full body as the edit canvas. The LAST image is SOURCE for pose, camera, scene, and background ONLY — ignore the SOURCE woman's face and body."
      );
    }
    bits.push(
      "CRITICAL: Generate a NEW photo. Do NOT keep the SOURCE woman's face or body. Replace the primary female / left woman with the My Model. Copying the source woman is a failure."
    );
    bits.push(
      "If SOURCE has multiple people, only the female subject becomes the My Model unless Extra direction says otherwise; other people follow Extra direction."
    );
    bits.push(recreateNoTextRule());
    if (input.keepPose !== false) {
      bits.push(
        "Keep pose ON: match SOURCE pose and framing, but rebuild the female body as the My Model."
      );
    } else {
      bits.push(
        "Keep pose OFF: scene/setting from SOURCE; pose may adjust; female body must still be the My Model."
      );
    }
    const clothes = clothingInstruction(recipeContext(input));
    if (clothes) bits.push(`Clothing rule: ${clothes}`);
  }
  if (input.durationSec) bits.push(`Clip length target: ~${input.durationSec}s`);
  if (input.aspect) bits.push(`Aspect ratio: ${input.aspect}`);
  if (input.presetHint) bits.push(`Preset vibe: ${input.presetHint}`);
  if (input.refLabels?.length) {
    bits.push(`Reference tags: ${input.refLabels.join(", ")}`);
  }
  if (input.keepPose && input.mode !== "recreate") {
    bits.push("Preserve pose/composition from references.");
  }
  if (input.mode === "presets") {
    bits.push(
      "Mode: presets — lean into the preset vibe while staying photoreal when appropriate."
    );
  }
  bits.push(
    "Rewrite into the target model's preferred prompt language. Output the prompt only."
  );
  return bits.join("\n");
}

/** Always re-assert identity + no-text after LLM rewrite so source faces/captions can't win. */
function sealIdentity(prompt: string, ctx: RecipeContext): string {
  const name = ctx.modelName?.trim();
  const trimmed = prompt.trim();
  const isRecreate = ctx.mode === "recreate" || Boolean(ctx.hasSourceImage);

  if (!name && !isRecreate) return trimmed;

  const parts: string[] = [];
  if (isRecreate && name) {
    const sourceIndex = ctx.sourceImageIndex ?? (ctx.identityRefCount ?? 1) + 1;
    parts.push(
      ctx.recreateImageOrder === "source-first"
        ? `Identity priority: Images 2+ are ${name}. Replace the Image-1 SOURCE woman with ${name}'s full body and face — do NOT keep the SOURCE woman's face or body.`
        : `Identity priority: Image1 is ${name} (KEEP face+hair+body). Image${sourceIndex} is SOURCE pose/scene only — put ${name} into that pose; do NOT keep Image${sourceIndex}'s face, hair, body, age, or figure.`
    );
    parts.push(recreateFaceKeepList(name));
  } else if (name) {
    parts.push(
      ctx.hasImage
        ? `Keep ${name}'s exact face, age, hair, body, and identity from the reference images as the sole subject — do not invent a different person.`
        : `Featuring ${name} as the sole subject.`
    );
  }
  if (isRecreate) {
    parts.push(recreateNoTextRule());
  }

  // Drop a weak prior lock if we're about to re-seal harder rules.
  const withoutDup = trimmed
    .replace(/Identity-first recreate:[^.]*\./gi, " ")
    .replace(/Identity priority:[^.]*\./gi, " ")
    .replace(/KEEP from Image 1[^.]*\./gi, " ")
    .replace(/NO text in the output:[^.]*\./gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Face lock at BOTH ends — models often attend to the final sentence.
  const head = parts.join(" ");
  const tail =
    isRecreate && name
      ? `Final check: output face must match Image1 (${name}), not the SOURCE woman.`
      : "";
  return `${head} ${withoutDup} ${tail}`.replace(/\s+/g, " ").trim();
}

/**
 * Expand a short user intent into a model-specific prompt.
 * Uses a dedicated recipe per modelId (never a single shared format).
 * LLM: kie.ai Gemini 3.8 Flash (openai) via the user's BYO kie key.
 */
export async function enhancePrompt(
  input: PromptBuildInput
): Promise<PromptBuildResult> {
  const recipe = getPromptRecipe(input.modelId);
  const ctx = recipeContext(input);
  const text = input.userText.trim();
  const isRecreate = input.mode === "recreate" || Boolean(input.hasSourceImage);

  // Recreate: always use the deterministic identity-lock prompt.
  // LLM rewrite was softening face rules and letting SOURCE features win.
  if (isRecreate) {
    return {
      prompt: sealIdentity(recreateFallback(text, ctx), ctx),
      provider: "passthrough",
      recipeId: recipe.id,
      formulaName: recipe.formulaName,
      note: "Recreate uses locked identity recipe (no LLM rewrite).",
    };
  }

  if (!input.enhanceWithAi) {
    const base = text || recipe.fallbackExpand("", ctx);
    return {
      prompt: sealIdentity(base, ctx),
      provider: "passthrough",
      recipeId: recipe.id,
      formulaName: recipe.formulaName,
    };
  }

  if (input.kieApiKey) {
    try {
      const raw = await kieChatComplete({
        apiKey: input.kieApiKey,
        system: recipe.systemPrompt,
        user: buildUserMessage(input, recipe.formulaName),
      });
      return {
        prompt: sealIdentity(raw, ctx),
        provider: "kie-chat",
        recipeId: recipe.id,
        formulaName: recipe.formulaName,
        note: `Enhanced with ${recipe.label} recipe via kie Gemini Flash.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enhancer failed";
      return {
        prompt: recipe.fallbackExpand(text, ctx),
        provider: "recipe-fallback",
        recipeId: recipe.id,
        formulaName: recipe.formulaName,
        note: `LLM enhance failed (${message}); used ${recipe.label} deterministic recipe.`,
      };
    }
  }

  return {
    prompt: recipe.fallbackExpand(text, ctx),
    provider: "recipe-fallback",
    recipeId: recipe.id,
    formulaName: recipe.formulaName,
    note: `No kie key for LLM — used ${recipe.label} deterministic recipe.`,
  };
}

/** @deprecated Prefer enhancePrompt — kept for any sync callers */
export function expandPromptStub(input: PromptBuildInput): string {
  const recipe = getPromptRecipe(input.modelId);
  const ctx = recipeContext(input);
  if (input.mode === "recreate" || input.hasSourceImage) {
    return recreateFallback(input.userText, ctx);
  }
  return recipe.fallbackExpand(input.userText, ctx);
}

export function parseAtMentions(text: string): {
  modelSlugs: string[];
  refTags: string[];
} {
  const modelSlugs: string[] = [];
  const refTags: string[] = [];
  const re = /@([a-zA-Z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tag = m[1];
    if (/^ref\d+$/i.test(tag)) {
      refTags.push(tag.toLowerCase());
    } else {
      modelSlugs.push(tag.toLowerCase());
    }
  }
  return {
    modelSlugs: [...new Set(modelSlugs)],
    refTags: [...new Set(refTags)],
  };
}
