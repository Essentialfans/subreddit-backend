import { createKieTask, getKieTask } from "@/lib/kie/client";

/**
 * Verbatim dialogue via kie Nemotron 3.5 Transcribe.
 * Accepts a public audio URL or MP4/MOV with an audio track.
 */
export async function transcribeMediaUrl(options: {
  apiKey: string;
  mediaUrl: string;
  withTimestamps?: boolean;
}): Promise<{ transcript: string; raw?: unknown }> {
  const { taskId } = await createKieTask(options.apiKey, {
    model: "nvidia/nemotron-3-5-transcribe",
    input: {
      audio_url: options.mediaUrl,
      timestamps: Boolean(options.withTimestamps),
    },
  });

  const started = Date.now();
  while (Date.now() - started < 4 * 60 * 1000) {
    const info = await getKieTask(options.apiKey, taskId);
    if (/fail|error/.test(info.state)) {
      throw new Error(info.failMsg || "Transcription failed");
    }
    if (/success|complete|done|finish/.test(info.state)) {
      const transcript = await extractTranscript(info.raw, info.resultUrls);
      if (!transcript.trim()) {
        throw new Error("Transcription returned empty text");
      }
      return { transcript: transcript.trim(), raw: info.raw };
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Transcription timed out");
}

async function extractTranscript(
  raw: unknown,
  resultUrls: string[]
): Promise<string> {
  const texts: string[] = [];

  function walk(value: unknown) {
    if (!value) return;
    if (typeof value === "string") {
      // Skip bare URLs
      if (!/^https?:\/\//i.test(value) && value.trim().length > 0) {
        // Prefer fields that look like transcripts when parent walk passes objects
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      const row = value as Record<string, unknown>;
      for (const key of [
        "text",
        "transcript",
        "text_with_speakers",
        "transcription",
      ]) {
        if (typeof row[key] === "string" && row[key].trim()) {
          texts.push(String(row[key]).trim());
        }
      }
      if (typeof row.resultJson === "string") {
        try {
          walk(JSON.parse(row.resultJson));
        } catch {
          // ignore
        }
      }
      for (const nested of Object.values(row)) {
        if (nested && typeof nested === "object") walk(nested);
      }
    }
  }

  walk(raw);

  if (texts.length) {
    // Longest non-empty text wins
    return texts.sort((a, b) => b.length - a.length)[0];
  }

  // Some jobs put transcript JSON at a result URL
  for (const url of resultUrls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json") || url.endsWith(".json")) {
        const json = await res.json();
        walk(json);
        if (texts.length) {
          return texts.sort((a, b) => b.length - a.length)[0];
        }
      } else {
        const body = (await res.text()).trim();
        if (body && !body.startsWith("<!") && body.length < 200_000) {
          try {
            walk(JSON.parse(body));
            if (texts.length) {
              return texts.sort((a, b) => b.length - a.length)[0];
            }
          } catch {
            return body;
          }
        }
      }
    } catch {
      // try next
    }
  }

  return "";
}
