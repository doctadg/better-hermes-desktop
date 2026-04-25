/**
 * sha256 helper for the Memory feature.
 *
 * Re-exports the canonical SubtleCrypto-based implementation from the soul
 * feature so that MEMORY.md / USER.md edits hash content identically to the
 * SOUL.md editor — same UTF-8 → SHA-256 → lowercase-hex pipeline that dodo's
 * `FileEditorService.swift` uses on the Apple side. Keeping a single
 * implementation avoids drift if the encoding ever changes.
 */
export { sha256 } from '../soul/sha256';
