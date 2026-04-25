/**
 * Hermes Desktop - Markdown content normalization
 *
 * Defends the renderer against malformed message content. Content can arrive
 * with literal escape sequences (a backslash followed by `n`/`t`/`r`/`"`)
 * instead of the real characters when:
 *   - the model emits escape sequences in its text output verbatim
 *   - session history was persisted with JSON-encoded strings and never decoded
 *   - an upstream stage double-encoded the payload before SSE
 *
 * Without this, ReactMarkdown sees a single long line — bold/inline-code still
 * render, but paragraph and list breaks collapse and the message looks like
 * one wall of text.
 *
 * We only decode OUTSIDE of code regions (fenced ``` blocks and inline `code`)
 * so a code sample that legitimately shows `\n` in a regex stays intact.
 */

const CODE_REGION = /(```[\s\S]*?```|``[^`\n]*``|`[^`\n]+`)/g;

function decodeEscapes(text: string): string {
  if (!text || !text.includes('\\')) return text;

  // Single left-to-right pass. `\\` collapses to a literal backslash;
  // `\n`/`\r`/`\t`/`\"` become the real character. Anything else (e.g. `\d`
  // in a regex shown inline, a Windows path) passes through unchanged.
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '\\' || i === text.length - 1) {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    switch (next) {
      case 'n': out += '\n'; i++; break;
      case 'r': out += '\r'; i++; break;
      case 't': out += '\t'; i++; break;
      case '"': out += '"'; i++; break;
      case '\\': out += '\\'; i++; break;
      default: out += ch; break;
    }
  }
  return out;
}

export function normalizeMarkdownContent(content: string): string {
  if (!content) return content;

  // Fast path: nothing to do if there are no candidate escape sequences.
  if (!/\\[nrt"\\]/.test(content)) return content;

  const parts = content.split(CODE_REGION);
  for (let i = 0; i < parts.length; i++) {
    // Even indices are non-code text; odd indices are captured code spans.
    if (i % 2 === 0) parts[i] = decodeEscapes(parts[i]);
  }
  return parts.join('');
}
