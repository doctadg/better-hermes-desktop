/**
 * sha256(text) → lowercase hex string.
 *
 * Uses SubtleCrypto (Web Crypto API), which is available in Electron's
 * renderer process and any modern browser. Pure function, no side effects.
 *
 * Used by the skills feature for hash-based optimistic-concurrency on
 * SKILL.md edits — we hash the content the user opened, then on save we
 * re-fetch the latest content, hash it, and compare. Mismatch ⇒ conflict.
 *
 * The exact hashing scheme (sha256 of UTF-8 bytes, hex-encoded) matches
 * dodo's Swift `SkillBrowserService.skillWriteBody` so a future server-side
 * `expected_content_hash` round-trip can interop without re-encoding.
 */
export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
