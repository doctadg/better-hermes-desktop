/**
 * Hermes Desktop — Sessions feature: FTS5 snippet highlighter.
 *
 * Renders a snippet string from `messages.search()` where matches are wrapped
 * in `<<...>>` markers (the conventional FTS5 snippet delimiters configured
 * in Phase 0). We render React fragments — never `dangerouslySetInnerHTML` —
 * so even adversarial message content can't inject markup.
 *
 * Unmatched bracket sequences degrade gracefully: any `<<` without a closing
 * `>>` is rendered as plain text.
 */

import React from 'react';

interface SnippetHighlightProps {
  snippet: string;
  className?: string;
  highlightClassName?: string;
}

const DEFAULT_HIGHLIGHT_CLASS = 'bg-amber-500/20 text-amber-300 rounded px-0.5';

export function SnippetHighlight({
  snippet,
  className,
  highlightClassName = DEFAULT_HIGHLIGHT_CLASS,
}: SnippetHighlightProps): React.ReactElement {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < snippet.length) {
    const open = snippet.indexOf('<<', cursor);
    if (open === -1) {
      parts.push(<React.Fragment key={key++}>{snippet.slice(cursor)}</React.Fragment>);
      break;
    }
    const close = snippet.indexOf('>>', open + 2);
    if (close === -1) {
      // Unbalanced — emit the rest as plain text and stop.
      parts.push(<React.Fragment key={key++}>{snippet.slice(cursor)}</React.Fragment>);
      break;
    }

    if (open > cursor) {
      parts.push(<React.Fragment key={key++}>{snippet.slice(cursor, open)}</React.Fragment>);
    }
    const inner = snippet.slice(open + 2, close);
    parts.push(
      <mark key={key++} className={highlightClassName}>
        {inner}
      </mark>,
    );
    cursor = close + 2;
  }

  return <span className={className}>{parts}</span>;
}
