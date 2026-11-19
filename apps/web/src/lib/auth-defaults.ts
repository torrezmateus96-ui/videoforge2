/**
 * RH-01 — AppSec & Secret Hygiene Policy for Authentication Inputs.
 *
 * Security invariants:
 * 1. Passwords are NEVER pre-filled from source constants or NEXT_PUBLIC_* env vars.
 * 2. In non-development environments, email autofill is strictly empty ("").
 * 3. Even in development, email autofill requires an explicit, syntactically safe
 *    NEXT_PUBLIC_DEV_AUTOFILL_EMAIL value free of control characters, HTML tags, or CRLF.
 * 4. Validation is strictly O(n) linear character scanning (immune to ReDoS).
 */

export type EnvLike = Record<string, string | undefined>;

const MAX_EMAIL_LENGTH = 254;
const FORBIDDEN_CHARS = new Set(["\r", "\n", "\0", "<", ">", '"', "'", "`", ";", "\\", " ", "\t"]);

export function sanitizeAuthEmail(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) {
    return "";
  }
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code < 33 || code === 127 || FORBIDDEN_CHARS.has(trimmed[i])) {
      return "";
    }
  }
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf("@") || atIndex >= trimmed.length - 3) {
    return "";
  }
  const domain = trimmed.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= domain.length - 1 || domain.includes("..")) {
    return "";
  }
  return trimmed;
}

export function getInitialAuthEmail(env?: EnvLike): string {
  const activeEnv: EnvLike =
    env ??
    (typeof process !== "undefined" && process.env
      ? (process.env as EnvLike)
      : {});

  const nodeEnv = String(activeEnv.NODE_ENV ?? "").trim();
  if (nodeEnv !== "development") {
    return "";
  }

  return sanitizeAuthEmail(activeEnv.NEXT_PUBLIC_DEV_AUTOFILL_EMAIL);
}

export function getInitialAuthPassword(): string {
  return "";
}
