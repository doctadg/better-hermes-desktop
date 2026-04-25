/**
 * sha256(text) → lowercase hex string.
 *
 * SubtleCrypto-based helper, available in Electron's renderer and any modern
 * browser. Pure function, no side effects.
 *
 * Used by the soul feature for hash-based optimistic-concurrency on SOUL.md
 * edits — we hash the content the user opened, then on save we re-fetch the
 * server's current content, hash it, and compare. Mismatch → conflict.
 *
 * The encoding (sha256 of UTF-8 bytes, lowercase hex) matches dodo's Swift
 * `FileEditorService` so a future server-side `expected_content_hash`
 * round-trip can interoperate without re-encoding.
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
