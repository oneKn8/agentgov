const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const API_KEY = /\b(?:sk|pk|api|key|token|secret)[_-]?[A-Za-z0-9]{16,}\b/gi;

export function redactText(text: string): string {
  return text
    .replace(EMAIL, "[REDACTED_EMAIL]")
    .replace(PHONE, "[REDACTED_PHONE]")
    .replace(SSN, "[REDACTED_SSN]")
    .replace(API_KEY, "[REDACTED_SECRET]");
}

export function redactJson<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map(redactJson) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (/raw|transcript|payload|secret|token|key/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactJson(child);
      }
    }
    return out as T;
  }
  return value;
}
