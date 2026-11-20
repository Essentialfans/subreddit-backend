/**
 * Prompt-from-video LLMs via the user's BYO kie.ai key.
 * Separate from the fast Enhance Flash path.
 */

const KIE_BASE = "https://api.kie.ai";

export type PromptLlmId = "grok-4-7" | "gemini-4-hydrogen" | "claude-opus-5-5";

export interface PromptLlmOption {
  id: PromptLlmId;
  label: string;
  blurb: string;
}

export const PROMPT_LLM_OPTIONS: PromptLlmOption[] = [
  {
    id: "grok-4-7",
    label: "Grok 4.7",
    blurb: "Best for adult / explicit scene beats — least soft-censor",
  },
  {
    id: "gemini-4-hydrogen",
    label: "Gemini 4 Hydrogen",
    blurb: "Strong general video understanding (may soft-censor adult beats)",
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    blurb: "Detail fallback — often refuses explicit wardrobe / nudity",
  },
];

export function findPromptLlm(id: string | null | undefined): PromptLlmOption | undefined {
  return PROMPT_LLM_OPTIONS.find((o) => o.id === id);
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:text|markdown|prompt)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function friendlyLlmError(raw: string, llm: PromptLlmId): string {
  const msg = raw.trim() || "LLM request failed";
  if (/internal error/i.test(msg) || /please try again later/i.test(msg)) {
    if (llm === "claude-opus-5-5") {
      return "Claude refused or failed on this clip (common on explicit wardrobe). Use Grok 4.7 for adult recreates.";
    }
    return `${msg} — try Grok 4.7, or regenerate in a moment.`;
  }
  if (/content.?policy|safety|refus|nsfw|moderation/i.test(msg)) {
    return "This LLM blocked the clip. Switch to Grok 4.7 for adult / explicit motion.";
  }
  return msg;
}

async function parseJsonResponse(
  response: Response,
  llm: PromptLlmId
): Promise<Record<string, unknown>> {
  const json = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!json) {
    throw new Error(
      friendlyLlmError(`Empty LLM response (HTTP ${response.status})`, llm)
    );
  }
  if (!response.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(
      friendlyLlmError(
        String(json.msg || json.message || err?.message || `LLM HTTP ${response.status}`),
        llm
      )
    );
  }
  if (typeof json.code === "number" && json.code !== 200) {
    throw new Error(
      friendlyLlmError(
        String(json.msg || json.message || `LLM error ${json.code}`),
        llm
      )
    );
  }
  const nestedErr = json.error as { message?: string; type?: string } | undefined;
  if (nestedErr?.message && !json.output && !json.content && !json.choices) {
    throw new Error(friendlyLlmError(nestedErr.message, llm));
  }
  return json;
}

function extractGrokText(json: Record<string, unknown>): string {
  const chunks: string[] = [];
  const output = json.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      // Skip reasoning blocks — only take assistant messages
      if (row.type === "reasoning") continue;
      if (row.type === "message" && Array.isArray(row.content)) {
        for (const part of row.content) {
          if (!part || typeof part !== "object") continue;
          const p = part as { type?: string; text?: string };
          if (typeof p.text === "string" && p.text.trim()) {
            chunks.push(p.text);
          }
        }
      }
      if (typeof row.text === "string" && row.type !== "reasoning") {
        chunks.push(row.text);
      }
    }
  }
  const choices = json.choices as
    | Array<{ message?: { content?: string } }>
    | undefined;
  if (choices?.[0]?.message?.content) {
    chunks.push(choices[0].message.content);
  }
  if (typeof json.output_text === "string") chunks.push(json.output_text);
  return stripFences(chunks.join("\n"));
}

/** Grok 4.7 Responses API — text + input_image parts. */
async function grokComplete(options: {
  apiKey: string;
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<string> {
  const content: Array<Record<string, string>> = [
    {
      type: "input_text",
      text: `${options.system}\n\n---\n\n${options.userText}`,
    },
    ...options.imageUrls.slice(0, 10).map((image_url) => ({
      type: "input_image",
      image_url,
    })),
  ];

  const response = await fetch(`${KIE_BASE}/grok/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-4-7",
      stream: false,
      // medium: better scene fidelity; low often dumps junk flags
      reasoning: { effort: "medium" },
      input: [{ role: "user", content }],
    }),
    cache: "no-store",
  });

  const json = await parseJsonResponse(response, "grok-4-7");
  const text = extractGrokText(json);
  if (!text) throw new Error("Grok returned an empty prompt");
  return text;
}

/** Gemini 4 Hydrogen via OpenAI-compatible chat (vision parts). */
async function geminiHydrogenComplete(options: {
  apiKey: string;
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<string> {
  const model = "gemini-4-hydrogen-openai";
  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: options.userText },
    ...options.imageUrls.slice(0, 10).map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  const response = await fetch(`${KIE_BASE}/${model}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      stream: false,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: userContent },
      ],
    }),
    cache: "no-store",
  });

  const json = await parseJsonResponse(response, "gemini-4-hydrogen");
  const choices = json.choices as
    | Array<{ message?: { content?: string | Array<{ text?: string }> } }>
    | undefined;
  const content = choices?.[0]?.message?.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content.map((p) => p.text ?? "").join("");
  }
  text = stripFences(text);
  if (!text) throw new Error("Gemini returned an empty prompt");
  return text;
}

/**
 * Claude Opus 5.5 via kie Anthropic-compatible messages.
 * kie schema does not reliably accept top-level `system`, so instructions
 * are folded into the first user text block.
 */
async function claudeOpusComplete(options: {
  apiKey: string;
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<string> {
  const content: Array<Record<string, unknown>> = [
    ...options.imageUrls.slice(0, 10).map((url) => ({
      type: "image",
      source: { type: "url", url },
    })),
    {
      type: "text",
      text: `${options.system}\n\n---\n\n${options.userText}`,
    },
  ];

  const response = await fetch(`${KIE_BASE}/claude/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      stream: false,
      messages: [{ role: "user", content }],
    }),
    cache: "no-store",
  });

  const json = await parseJsonResponse(response, "claude-opus-5-5");
  const parts = json.content as Array<{ type?: string; text?: string }> | undefined;
  const text = stripFences(
    (parts ?? [])
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("\n")
  );
  if (!text) {
    throw new Error(
      friendlyLlmError(
        "Claude returned empty text (often a content refusal on explicit clips). Use Grok 4.7.",
        "claude-opus-5-5"
      )
    );
  }
  return text;
}

export async function runPromptLlm(options: {
  llm: PromptLlmId;
  apiKey: string;
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<string> {
  try {
    switch (options.llm) {
      case "grok-4-7":
        return await grokComplete(options);
      case "gemini-4-hydrogen":
        return await geminiHydrogenComplete(options);
      case "claude-opus-5-5":
        return await claudeOpusComplete(options);
      default:
        throw new Error(`Unknown prompt LLM: ${options.llm}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(friendlyLlmError(msg, options.llm));
  }
}
