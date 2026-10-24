import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function secretMaterial() {
  const raw =
    process.env.PROVIDER_SECRETS_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!raw) {
    throw new Error("Missing PROVIDER_SECRETS_KEY for API key encryption");
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretMaterial(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptSecret(ciphertext: string, iv: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  const data = buf.subarray(0, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretMaterial(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

export function keyHint(plain: string): string {
  const trimmed = plain.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
