/**
 * yamlFrontmatter — pure helpers for detecting and splitting YAML frontmatter
 * blocks at the head of a SOUL.md document.
 *
 * Frontmatter is the conventional Jekyll/Hugo-style block: a `---` line, some
 * YAML, a closing `---` line. We don't parse the YAML itself (no dep budget
 * for js-yaml); we only locate the bounds so the editor can show a badge and
 * the body can be rendered separately if needed.
 *
 * Rules (matched against fathah's behaviour):
 *  - the block must start at the very first character of the document
 *  - the opening fence is exactly `---` on its own line (trailing whitespace ok)
 *  - the closing fence is the next `---` line found after the opener
 *  - the body is everything after the closing fence, with one leading newline
 *    consumed if present
 *  - if either fence is missing, `hasFrontmatter` is false and `body` is the
 *    original content
 */

export interface FrontmatterResult {
  /** True iff the content begins with a complete `---` … `---` block. */
  hasFrontmatter: boolean;
  /** The content with the frontmatter stripped (or the original when none). */
  body: string;
  /** The raw YAML text between the fences, without the fences themselves. */
  frontmatter?: string;
}

/** Match a line consisting of exactly `---` (with optional trailing whitespace). */
const FENCE_RE = /^---[ \t]*$/;

export function detectFrontmatter(content: string): FrontmatterResult {
  if (!content) {
    return { hasFrontmatter: false, body: content };
  }

  // Frontmatter must start at byte zero — even one leading newline disqualifies.
  // Split into lines while preserving the original line endings via a join later.
  const lines = content.split('\n');
  if (lines.length < 2) {
    return { hasFrontmatter: false, body: content };
  }

  if (!FENCE_RE.test(lines[0])) {
    return { hasFrontmatter: false, body: content };
  }

  // Find the next fence line after the opener.
  let closingIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      closingIdx = i;
      break;
    }
  }

  if (closingIdx === -1) {
    // Opening fence with no closer — treat as no frontmatter so the body
    // doesn't get truncated.
    return { hasFrontmatter: false, body: content };
  }

  const frontmatter = lines.slice(1, closingIdx).join('\n');
  const body = lines.slice(closingIdx + 1).join('\n');

  return {
    hasFrontmatter: true,
    body,
    frontmatter,
  };
}
