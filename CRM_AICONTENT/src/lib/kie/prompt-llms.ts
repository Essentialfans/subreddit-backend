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
    blurb: "Strong general video understanding",
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    blurb: "Strong adult detail fallback",
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

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const json = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!json) throw new Error(`Empty LLM response (HTTP ${response.status})`);
  if (!response.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(
      String(json.msg || json.message || err?.message || `LLM HTTP ${response.status}`)
    );
  }
  if (typeof json.code === "number" && json.code !== 200) {
    throw new Error(String(json.msg || json.message || `LLM error ${json.code}`));
  }
  return json;
}

/** Grok 4.7 Responses API — text + input_image parts. */
async function grokComplete(options: {
  apiKey: string;
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<string> {
  const content: Array<Record<string, string>> = [
    { type: "input_text", text: `${options.system}\n\n${options.userText}` },
    ...options.imageUrls.slice(0, 8).map((image_url) => ({
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
      reasoning: { effort: "low" },
      input: [{ role: "user", content }],
    }),
    cache: "no-store",
  });

  const json = await parseJsonResponse(response);
  // Responses API shapes vary — collect text from output[] or choices
  const chunks: string[] = [];
  const output = json.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (row.type === "message" && Array.isArray(row.content)) {
        for (const part of row.content) {
          if (
            part &&
            typeof part === "object" &&
            typeof (part as { text?: string }).text === "string"
          ) {
            chunks.push((part as { text: string }).text);
          }
        }
      }
      if (typeof row.text === "string") chunks.push(row.text);
    }
  }
  const choices = json.choices as
    | Array<{ message?: { content?: string } }>
    | undefined;
  if (choices?.[0]?.message?.content) {
    chunks.push(choices[0].message.content);
  }
  if (typeof json.output_text === "string") chunks.push(json.output_text);

  const text = stripFences(chunks.join("\n"));
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
    ...options.imageUrls.slice(0, 8).map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  const response = await fetch(
    `${KIE_BASE}/${model}/v1/chat/completions`,
    {
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
    }
  );

  const json = await parseJsonResponse(response);
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

/** Claude Opus 5.5 via kie Anthropic-compatible messages. */
async function claudeOpusComplete(options: {
  apiKey: string;
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<string> {
  const content: Array<Record<string, unknown>> = [
    ...options.imageUrls.slice(0, 8).map((url) => ({
      type: "image",
      source: { type: "url", url },
    })),
    { type: "text", text: options.userText },
  ];

  const response = await fetch(`${KIE_BASE}/claude/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      stream: false,
      system: options.system,
      messages: [{ role: "user", content }],
    }),
    cache: "no-store",
  });

  const json = await parseJsonResponse(response);
  const parts = json.content as Array<{ type?: string; text?: string }> | undefined;
  const text = stripFences(
    (parts ?? [])
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("\n")
  );
  if (!text) throw new Error("Claude returned an empty prompt");
  return text;
}

export async function runPromptLlm(options: {
  llm: PromptLlmId;
  apiKey: string;
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<string> {
  switch (options.llm) {
    case "grok-4-7":
      return grokComplete(options);
    case "gemini-4-hydrogen":
      return geminiHydrogenComplete(options);
    case "claude-opus-5-5":
      return claudeOpusComplete(options);
    default:
      throw new Error(`Unknown prompt LLM: ${options.llm}`);
  }
}
