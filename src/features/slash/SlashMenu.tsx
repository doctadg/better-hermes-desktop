/**
 * SlashMenu — dropdown that floats above the chat input, listing the slash
 * command catalog filtered by the user's current query. Driven entirely by
 * `useSlashMenu`; this component is a pure renderer plus mouse handling.
 *
 * Visual rules:
 *   - selected row: amber-500/10 background, amber-500 text
 *   - rows: lucide icon | name (zinc-100) | description (zinc-500 sm) | badge
 *   - empty filter: rows are grouped under category headings
 *   - non-empty filter: a flat list of matches, no headings
 */

import { useEffect, useMemo, useRef } from 'react';
import { Slash } from 'lucide-react';
import {
  CATEGORY_BADGE_CLASS,
  CATEGORY_LABEL,
  groupByCategory,
  type SlashCommand,
} from './commands';

export interface SlashMenuProps {
  open: boolean;
  items: SlashCommand[];
  selectedIndex: number;
  /** Set selection (used by hover / mouse). */
  onHover: (index: number) => void;
  /** User clicked a row. */
  onPick: (index: number) => void;
  /** True while the user has typed `/<text>` (i.e. filtering). */
  isFiltering: boolean;
  /** Optional extra classes for the outer container (positioning). */
  className?: string;
}

export function SlashMenu({
  open,
  items,
  selectedIndex,
  onHover,
  onPick,
  isFiltering,
  className = '',
}: SlashMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll active item into view on selection change.
  useEffect(() => {
    if (!open) return;
    const root = listRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, open]);

  // Pre-compute groups for the empty-filter view; preserve flat list when
  // filtering so the user sees an instantly-updating top-N of matches.
  const grouped = useMemo(
    () => (isFiltering ? null : groupByCategory(items)),
    [isFiltering, items]
  );

  if (!open) return null;

  return (
    <div
      className={
        'absolute bottom-full left-0 right-0 mb-2 z-30 ' +
        'rounded-xl border border-zinc-800 bg-zinc-950/95 shadow-2xl ' +
        'backdrop-blur-md overflow-hidden ' +
        className
      }
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-800/80 text-[11px] uppercase tracking-wide text-zinc-500">
        <Slash size={11} />
        <span>Commands</span>
        {items.length > 0 && (
          <span className="ml-auto text-zinc-600 normal-case">
            {items.length} {items.length === 1 ? 'match' : 'matches'}
          </span>
        )}
      </div>

      <div
        ref={listRef}
        className="max-h-72 overflow-y-auto py-1 slash-menu-scroll"
      >
        {items.length === 0 ? (
          <div className="px-3 py-4 text-sm text-zinc-500 text-center">
            No commands match.
          </div>
        ) : grouped ? (
          // Grouped (empty filter) view.
          (() => {
            let runningIndex = 0;
            return grouped.map(({ category, items: groupItems }) => {
              const groupStart = runningIndex;
              runningIndex += groupItems.length;
              return (
                <div key={category} className="mb-1 last:mb-0">
                  <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
                    {CATEGORY_LABEL[category]}
                  </div>
                  {groupItems.map((cmd, localIdx) => {
                    const flatIdx = groupStart + localIdx;
                    return (
                      <SlashRow
                        key={cmd.id}
                        command={cmd}
                        active={flatIdx === selectedIndex}
                        onHover={() => onHover(flatIdx)}
                        onPick={() => onPick(flatIdx)}
                      />
                    );
                  })}
                </div>
              );
            });
          })()
        ) : (
          items.map((cmd, idx) => (
            <SlashRow
              key={cmd.id}
              command={cmd}
              active={idx === selectedIndex}
              onHover={() => onHover(idx)}
              onPick={() => onPick(idx)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface SlashRowProps {
  command: SlashCommand;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}

function SlashRow({ command, active, onHover, onPick }: SlashRowProps) {
  const Icon = command.icon;
  return (
    <button
      type="button"
      data-active={active ? 'true' : undefined}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        // mousedown to fire before the input loses focus
        e.preventDefault();
        onPick();
      }}
      className={
        'w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors duration-75 ' +
        (active
          ? 'bg-amber-500/10 text-amber-500'
          : 'text-zinc-300 hover:bg-zinc-900')
      }
      role="option"
      aria-selected={active}
    >
      <Icon
        size={14}
        className={active ? 'text-amber-400' : 'text-zinc-500'}
      />
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span
          className={
            'font-mono text-sm shrink-0 ' +
            (active ? 'text-amber-300' : 'text-zinc-100')
          }
        >
          {command.name}
        </span>
        {command.defaultArgsHint && (
          <span className="font-mono text-xs text-zinc-600 shrink-0">
            {command.defaultArgsHint}
          </span>
        )}
        <span
          className={
            'text-xs truncate ' +
            (active ? 'text-amber-300/80' : 'text-zinc-500')
          }
        >
          {command.description}
        </span>
      </div>
      <span
        className={
          'shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ' +
          CATEGORY_BADGE_CLASS[command.category]
        }
      >
        {CATEGORY_LABEL[command.category]}
      </span>
    </button>
  );
}
