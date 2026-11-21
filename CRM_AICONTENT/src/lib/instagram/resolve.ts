/**
 * Resolve public Instagram reel/post media for import into AiInstaReels.
 * Uses snapsave-style public resolver (same class of tool as fastdl.app).
 * Instagram's own GraphQL now requires TLS browser impersonation on Workers,
 * so we resolve via an intermediary that returns short-lived CDN links.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
}

export function extractInstagramShortcode(input: string): string | null {
  const trimmed = input.trim();
  const m = SHORTCODE_RE.exec(trimmed);
  if (m?.[1]) return m[1];
  // bare shortcode
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

  // Decoded snapsave payload is JS that assigns escaped HTML (`href=\"...\"`).
  const unescaped = html.replace(/\\"/g, '"').replace(/\\'/g, "'");

  const hrefs = [
    ...unescaped.matchAll(/href="(https:\/\/d\.rapidcdn\.app\/[^"]+)"/gi),
  ].map((m) => m[1].replace(/&amp;/g, "&"));

  // Fallback: grab any rapidcdn media URLs if href parsing misses them
  if (!hrefs.length) {
    hrefs.push(
      ...[...html.matchAll(/https:\/\/d\.rapidcdn\.app\/(?!thumb)[^\s"'<>\\]+/gi)].map(
        (m) => m[0].replace(/&amp;/g, "&").replace(/\\+$/, "")
      )
    );
  }

  const thumbs = [
    ...unescaped.matchAll(
      /src="(https:\/\/d\.rapidcdn\.app\/thumb\?token=[^"]+)"/gi
    ),
  ].map((m) => m[1].replace(/&amp;/g, "&"));

  if (!thumbs.length) {
    const thumbFallback = html.match(
      /https:\/\/d\.rapidcdn\.app\/thumb\?token=[^\s"'<>\\]+/i
    );
    if (thumbFallback) {
      thumbs.push(thumbFallback[0].replace(/&amp;/g, "&").replace(/\\+$/, ""));
    }
  }

  for (const url of hrefs) {
    if (seen.has(url)) continue;
    // Skip pure thumbnail links as primary media
    if (/\/thumb\?/i.test(url)) continue;
    seen.add(url);
    const isVideo = /\/v2\?|filename=.*\.mp4|\.mp4/i.test(url);
    items.push({
      type: isVideo ? "video" : "photo",
      url,
      thumbnail: thumbs[0] ?? null,
    });
  }

  // Prefer video entries first
  items.sort((a, b) => Number(b.type === "video") - Number(a.type === "video"));
  return items;
}

export async function resolveInstagramMedia(
  inputUrl: string
): Promise<InstagramResolveResult> {
  const sourceUrl = normalizeInstagramUrl(inputUrl);
  const shortcode = extractInstagramShortcode(sourceUrl)!;

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
    throw new Error(`Instagram resolver HTTP ${res.status}`);
  }
  if (/private|login|not found|invalid/i.test(raw) && raw.length < 500) {
    throw new Error(
      "Could not access that post. Only public Reels/posts work (no private accounts)."
    );
  }

  let html: string;
  try {
    html = decodeSnapsavePayload(raw);
  } catch {
    // Sometimes already plain HTML
    html = raw;
  }

  const items = extractItemsFromHtml(html);
  if (!items.length) {
    throw new Error(
      "No downloadable media found. The Reel may be private, deleted, or Instagram is blocking resolves right now — try again in a minute."
    );
  }

  return {
    shortcode,
    sourceUrl,
    items,
    thumbnail: items[0]?.thumbnail ?? null,
    note: "Public Instagram media only. Copyright stays with the creator — use for your own recreate workflow.",
  };
}
