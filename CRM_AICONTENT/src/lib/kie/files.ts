/**
 * Rehost a public file onto kie.ai tempfile CDN so createTask can fetch it reliably.
 * File upload host differs from the jobs API host.
 */

const KIE_FILE_BASES = [
  "https://kieai.redpandaai.co",
  "https://api.kie.ai",
] as const;

async function postJson(
  base: string,
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<{ downloadUrl?: string; msg?: string; code?: number; success?: boolean }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    code?: number;
    msg?: string;
    data?: { downloadUrl?: string };
  } | null;
  return {
    downloadUrl: json?.data?.downloadUrl,
    msg: json?.msg,
    code: json?.code,
    success: json?.success,
  };
}

/** Prefer URL-upload; fall back to base64 if kie can’t pull the remote URL. */
export async function rehostToKie(options: {
  apiKey: string;
  fileUrl: string;
  uploadPath: string;
  fileName?: string;
}): Promise<string> {
  const { apiKey, fileUrl, uploadPath, fileName } = options;

  for (const base of KIE_FILE_BASES) {
    try {
      const viaUrl = await postJson(base, "/api/file-url-upload", apiKey, {
        fileUrl,
        uploadPath,
        ...(fileName ? { fileName } : {}),
      });
      if (viaUrl.downloadUrl && (viaUrl.code === 200 || viaUrl.success !== false)) {
        return viaUrl.downloadUrl;
      }
    } catch {
      // try next base / strategy
    }
  }

  // Pull ourselves (Worker can fetch public Supabase) and push bytes to kie.
  const remote = await fetch(fileUrl, { cache: "no-store" });
  if (!remote.ok) {
    throw new Error(
      `Could not fetch media for kie.ai rehost (HTTP ${remote.status})`
    );
  }
  const buffer = Buffer.from(await remote.arrayBuffer());
  const contentType =
    remote.headers.get("content-type") ||
    (fileUrl.match(/\.(mp4|mov|webm)(\?|$)/i)
      ? "video/mp4"
      : "image/jpeg");
  const ext =
    fileName?.split(".").pop() ||
    (contentType.includes("mp4")
      ? "mp4"
      : contentType.includes("png")
        ? "png"
        : "jpg");
  const b64 = `data:${contentType};base64,${buffer.toString("base64")}`;

  let lastMsg = "kie.ai file upload failed";
  for (const base of KIE_FILE_BASES) {
    for (const path of ["/api/file-base64-upload", "/api/v1/file-base64-upload"]) {
      try {
        const viaB64 = await postJson(base, path, apiKey, {
          base64Data: b64,
          uploadPath,
          fileName: fileName || `media.${ext}`,
        });
        if (
          viaB64.downloadUrl &&
          (viaB64.code === 200 || viaB64.success !== false)
        ) {
          return viaB64.downloadUrl;
        }
        if (viaB64.msg) lastMsg = viaB64.msg;
      } catch (err) {
        if (err instanceof Error && err.message) lastMsg = err.message;
      }
    }
  }

  throw new Error(lastMsg);
}
