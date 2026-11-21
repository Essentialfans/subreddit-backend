/**
 * Resolve public Instagram reel/post media for import into AiInstaReels.
 *
 * Instagram now login-walls anonymous media APIs from datacenter IPs.
 * We try several public resolvers, then an optional session-cookie path
 * (`INSTAGRAM_SESSIONID`) for authenticated web_info.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const IG_APP_ID = "936619743392459";

const SHORTCODE_RE =
  /(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

export interface InstagramMediaItem {
  type: "video" | "photo";
  url: string;
  thumbnail?: string | null;
}

export interface InstagramResolveResult {
  shortcode: string;
  sourceUrl: string;
  items: InstagramMediaItem[];
  thumbnail: string | null;
  note: string;
  resolver?: string;
}

export function extractInstagramShortcode(input: string): string | null {
  const trimmed = input.trim();
  const m = SHORTCODE_RE.exec(trimmed);
  if (m?.[1]) return m[1];
  if (/^[A-Za-z0-9_-]{5,20}$/.test(trimmed)) return trimmed;
  return null;
}

export function normalizeInstagramUrl(input: string): string {
  const code = extractInstagramShortcode(input);
  if (!code) {
    throw new Error(
      "Paste a public Instagram Reel / post URL (instagram.com/reel/…)."
    );
  }
  return `https://www.instagram.com/reel/${code}/`;
}

/** Decode snapsave obfuscated eval payload → HTML string. */
export function decodeSnapsavePayload(raw: string): string {
  const m = raw.match(
    /\}\("([^"]+)",(\d+),"([^"]+)",(\d+),(\d+),(\d+)\)\)/
  );
  if (!m) {
    throw new Error("Could not decode Instagram resolver response");
  }
  const h = m[1];
  const n = m[3];
  const t = Number(m[4]);
  const e = Number(m[5]);
  const alphabet =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/";

  function decodeBase(d: string, fromBase: number, toBase: number): string {
    const from = alphabet.slice(0, fromBase);
    const to = alphabet.slice(0, toBase);
    let j = 0;
    const chars = d.split("").reverse();
    for (let c = 0; c < chars.length; c++) {
      const idx = from.indexOf(chars[c]);
      if (idx !== -1) j += idx * fromBase ** c;
    }
    let k = "";
    while (j > 0) {
      k = to[j % toBase] + k;
      j = (j - (j % toBase)) / toBase;
    }
    return k || "0";
  }

  let out = "";
  let i = 0;
  while (i < h.length) {
    let s = "";
    while (i < h.length && h[i] !== n[e]) {
      s += h[i];
      i++;
    }
    for (let j = 0; j < n.length; j++) {
      s = s.split(n[j]).join(String(j));
    }
    out += String.fromCharCode(Number(decodeBase(s, e, 10)) - t);
    i++;
  }

  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

function extractItemsFromHtml(html: string): InstagramMediaItem[] {
  const items: InstagramMediaItem[] = [];
  const seen = new Set<string>();
  const unescaped = html.replace(/\\"/g, '"').replace(/\\'/g, "'");

  const hrefs = [
    ...unescaped.matchAll(/href="(https:\/\/d\.rapidcdn\.app\/[^"]+)"/gi),
  ].map((m) => m[1].replace(/&amp;/g, "&"));

  if (!hrefs.length) {
    hrefs.push(
      ...[
        ...html.matchAll(/https:\/\/d\.rapidcdn\.app\/(?!thumb)[^\s"'<>\\]+/gi),
      ].map((m) => m[0].replace(/&amp;/g, "&").replace(/\\+$/, ""))
    );
  }

  // Generic MP4 / fbcdn / cdninstagram video links
  if (!hrefs.length) {
    hrefs.push(
      ...[
        ...unescaped.matchAll(
          /https:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*/gi
        ),
      ].map((m) => m[0].replace(/&amp;/g, "&"))
    );
  }
  if (!hrefs.length) {
    hrefs.push(
      ...[
        ...unescaped.matchAll(
          /https:\/\/[^"'\s]*(?:fbcdn\.net|cdninstagram\.com)[^"'\s]*\/v\/[^"'\s]*/gi
        ),
      ].map((m) => m[0].replace(/&amp;/g, "&"))
    );
  }

  const thumbs = [
    ...unescaped.matchAll(
      /src="(https:\/\/d\.rapidcdn\.app\/thumb\?token=[^"]+)"/gi
    ),
  ].map((m) => m[1].replace(/&amp;/g, "&"));

  if (!thumbs.length) {
    const thumbFallback = html.match(
      /https:\/\/(?:d\.rapidcdn\.app\/thumb\?token=|[^"'\s]+cdninstagram\.com\/[^"'\s]+)[^\s"'<>\\]+/i
    );
    if (thumbFallback) {
      thumbs.push(thumbFallback[0].replace(/&amp;/g, "&").replace(/\\+$/, ""));
    }
  }

  for (const url of hrefs) {
    if (seen.has(url)) continue;
    if (/\/thumb\?/i.test(url)) continue;
    seen.add(url);
    const isVideo = /\.mp4|\.m3u8|\/v2\?|\/v\//i.test(url);
    items.push({
      type: isVideo ? "video" : "photo",
      url,
      thumbnail: thumbs[0] ?? null,
    });
  }

  items.sort((a, b) => Number(b.type === "video") - Number(a.type === "video"));
  return items;
}

function collectMediaUrlsFromJson(payload: unknown): InstagramMediaItem[] {
  const items: InstagramMediaItem[] = [];
  const seen = new Set<string>();

  function walk(node: unknown, depth = 0) {
    if (depth > 12 || node == null) return;
    if (typeof node === "string") {
      if (
        /^https?:\/\//i.test(node) &&
        (/\.mp4|\.m3u8/i.test(node) ||
          /fbcdn\.net\/v\/|cdninstagram\.com.*\/v\//i.test(node)) &&
        !seen.has(node)
      ) {
        seen.add(node);
        items.push({ type: "video", url: node, thumbnail: null });
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const videoUrl =
        (typeof obj.video_url === "string" && obj.video_url) ||
        (typeof obj.videoUrl === "string" && obj.videoUrl) ||
        (typeof obj.url === "string" &&
        /\.mp4|fbcdn\.net\/v\//i.test(obj.url)
          ? obj.url
          : null);
      if (videoUrl && !seen.has(videoUrl)) {
        seen.add(videoUrl);
        const thumb =
          (typeof obj.display_url === "string" && obj.display_url) ||
          (typeof obj.thumbnail === "string" && obj.thumbnail) ||
          (typeof obj.thumbnail_src === "string" && obj.thumbnail_src) ||
          null;
        items.push({ type: "video", url: videoUrl, thumbnail: thumb });
      }
      const imageUrl =
        (typeof obj.display_url === "string" && obj.display_url) ||
        (typeof obj.image_url === "string" && obj.image_url) ||
        null;
      if (
        imageUrl &&
        !videoUrl &&
        /\.(jpg|jpeg|png|webp)/i.test(imageUrl) &&
        !seen.has(imageUrl)
      ) {
        seen.add(imageUrl);
        items.push({ type: "photo", url: imageUrl, thumbnail: imageUrl });
      }
      for (const value of Object.values(obj)) walk(value, depth + 1);
    }
  }

  walk(payload);
  items.sort((a, b) => Number(b.type === "video") - Number(a.type === "video"));
  return items;
}

async function resolveViaSnapsave(
  sourceUrl: string
): Promise<InstagramMediaItem[]> {
  const body = new URLSearchParams({ url: sourceUrl, lang: "en" });
  const res = await fetch("https://snapsave.app/action.php", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://snapsave.app",
      Referer: "https://snapsave.app/",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "*/*",
    },
    body,
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Snapsave HTTP ${res.status}`);
  }

  let html: string;
  try {
    html = decodeSnapsavePayload(raw);
  } catch {
    html = raw;
  }

  if (/Unable to connect to Instagram/i.test(html)) {
    throw new Error("Snapsave cannot reach Instagram right now");
  }
  if (/private|login required|not found/i.test(html) && html.length < 800) {
    throw new Error("Post looks private or unavailable via Snapsave");
  }

  return extractItemsFromHtml(html);
}

/** Optional authenticated path — needs INSTAGRAM_SESSIONID env secret. */
async function resolveViaSessionCookie(
  shortcode: string
): Promise<InstagramMediaItem[]> {
  const sessionId = process.env.INSTAGRAM_SESSIONID?.trim();
  if (!sessionId) {
    throw new Error("No INSTAGRAM_SESSIONID configured");
  }

  const cookieParts = [`sessionid=${sessionId}`];
  const dsUser = process.env.INSTAGRAM_DS_USER_ID?.trim();
  if (dsUser) cookieParts.push(`ds_user_id=${dsUser}`);
  const csrftoken = process.env.INSTAGRAM_CSRFTOKEN?.trim() || "missing";
  cookieParts.push(`csrftoken=${csrftoken}`);

  const res = await fetch(
    `https://www.instagram.com/api/v1/media/web_info/?shortcode=${encodeURIComponent(
      shortcode
    )}`,
    {
      headers: {
        "User-Agent": UA,
        "X-IG-App-ID": IG_APP_ID,
        "X-ASBD-ID": "129477",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": csrftoken,
        Cookie: cookieParts.join("; "),
        Referer: `https://www.instagram.com/reel/${shortcode}/`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Instagram session resolve HTTP ${res.status}${
        /login_required/i.test(text) ? " (session expired — refresh cookie)" : ""
      }`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Instagram session resolve returned non-JSON");
  }

  const items = collectMediaUrlsFromJson(json);
  if (!items.length) {
    throw new Error("Session resolve returned no media URLs");
  }
  return items;
}

/** FastDL worker hub — often needs Turnstile; try unsigned as a fallback. */
async function resolveViaFastdlWorker(
  sourceUrl: string
): Promise<InstagramMediaItem[]> {
  const res = await fetch("https://api-wh.fastdl.app/api/convert", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://fastdl.app",
      Referer: "https://fastdl.app/",
    },
    body: JSON.stringify({ target_url: sourceUrl }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`FastDL HTTP ${res.status}`);

  // Response may be JSON with HTML/JS string fields containing media links.
  const fromHtml = extractItemsFromHtml(text);
  if (fromHtml.length) return fromHtml;

  try {
    const json = JSON.parse(text) as unknown;
    const fromJson = collectMediaUrlsFromJson(json);
    if (fromJson.length) return fromJson;
  } catch {
    // ignore
  }

  if (/invalid_request|URL_IS_EMPTY|Something went wrong/i.test(text)) {
    throw new Error("FastDL rejected the request (bot check)");
  }
  throw new Error("FastDL returned no media");
}

async function resolveViaSaveFromStyle(
  sourceUrl: string
): Promise<InstagramMediaItem[]> {
  // saveig / sssinstagram-style ajaxSearch mirrors
  const endpoints = [
    "https://v3.saveig.app/api/ajaxSearch",
    "https://api.sssinstagram.com/api/convert",
  ];

  let lastError = "No mirror responded";
  for (const endpoint of endpoints) {
    try {
      const isConvert = /convert/i.test(endpoint);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          "Content-Type": isConvert
            ? "application/json"
            : "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Origin: isConvert ? "https://sssinstagram.com" : "https://saveig.app",
          Referer: isConvert
            ? "https://sssinstagram.com/"
            : "https://saveig.app/en",
        },
        body: isConvert
          ? JSON.stringify({ url: sourceUrl })
          : new URLSearchParams({
              q: sourceUrl,
              t: "media",
              lang: "en",
            }).toString(),
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) {
        lastError = `${endpoint} HTTP ${res.status}`;
        continue;
      }
      const items = [
        ...extractItemsFromHtml(text),
        ...(() => {
          try {
            return collectMediaUrlsFromJson(JSON.parse(text));
          } catch {
            return [] as InstagramMediaItem[];
          }
        })(),
      ];
      // dedupe
      const seen = new Set<string>();
      const unique = items.filter((i) => {
        if (seen.has(i.url)) return false;
        seen.add(i.url);
        return true;
      });
      if (unique.length) return unique;
      lastError = `${endpoint} empty`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError);
}

export async function resolveInstagramMedia(
  inputUrl: string
): Promise<InstagramResolveResult> {
  const sourceUrl = normalizeInstagramUrl(inputUrl);
  const shortcode = extractInstagramShortcode(sourceUrl)!;

  const attempts: Array<{
    name: string;
    run: () => Promise<InstagramMediaItem[]>;
  }> = [
    { name: "snapsave", run: () => resolveViaSnapsave(sourceUrl) },
    { name: "fastdl-worker", run: () => resolveViaFastdlWorker(sourceUrl) },
    { name: "saveig-mirrors", run: () => resolveViaSaveFromStyle(sourceUrl) },
  ];

  // Prefer session cookie when configured — most reliable against IG login walls.
  if (process.env.INSTAGRAM_SESSIONID?.trim()) {
    attempts.unshift({
      name: "instagram-session",
      run: () => resolveViaSessionCookie(shortcode),
    });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const items = await attempt.run();
      if (items.length) {
        return {
          shortcode,
          sourceUrl,
          items,
          thumbnail: items[0]?.thumbnail ?? null,
          resolver: attempt.name,
          note:
            "Public Instagram media only. Copyright stays with the creator — use for your own recreate workflow.",
        };
      }
      errors.push(`${attempt.name}: empty`);
    } catch (err) {
      errors.push(
        `${attempt.name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const hasSession = Boolean(process.env.INSTAGRAM_SESSIONID?.trim());
  // Keep the public message short — UI shows FastDL + upload workarounds.
  void errors;
  throw new Error(
    hasSession
      ? "Could not download that Reel — Instagram blocked every resolver and your session cookie may be expired. Upload the MP4 below or open FastDL."
      : "Could not download that Reel — Instagram is blocking anonymous downloaders right now. Upload the MP4 below or open FastDL."
  );
}
