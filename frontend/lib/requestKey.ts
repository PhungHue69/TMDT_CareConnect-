/**
 * Idempotency key for one prescription upload attempt.
 * crypto.randomUUID only exists on secure (HTTPS/localhost) pages, but phones open the demo over
 * plain-HTTP LAN, where crypto.getRandomValues still works.
 */
export function newRequestKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
