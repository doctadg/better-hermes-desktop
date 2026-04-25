/**
 * useSlashMenu — drives the slash command dropdown attached to a chat input.
 *
 * Plug-into-anywhere hook. The host component owns its own input value/setter
 * (controlled component) and forwards three things:
 *   - the current value via `onInputChange(value)`
 *   - keyboard events via `onKeyDown(event)`
 *   - a `setValue` callback so the hook can populate the input on pick
 *
 * The hook only reacts to slash-relevant input shape: it opens when the line
 * starts with `/` and contains no space; it closes on Esc, on a non-slash
 * keystroke, or when the caller calls `close()`. Other keystrokes pass
 * through untouched, so the host's normal Enter→send and arrow-key behaviour
 * work whenever the menu is closed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SLASH_COMMANDS,
  filterCommands,
  type SlashCommand,
} from './commands';

export interface UseSlashMenuOptions {
  /** Updater for the host's controlled input value. */
  setValue: (next: string) => void;
}

export interface SlashMenuApi {
  /** Whether the dropdown should be visible. */
  open: boolean;
  /** Filtered commands to show (or all, grouped, when query is empty). */
  items: SlashCommand[];
  /** Index into `items` of the currently highlighted row. */
  selectedIndex: number;
  /** Current filter text — includes the leading `/`. */
  query: string;
  /** Forward the host input's current value here on every change. */
  onInputChange: (value: string) => void;
  /**
   * Forward the host input's keydown events here. The hook only consumes
   * events while the menu is open and only for the slash-navigation keys
   * (ArrowUp/Down, Enter, Tab, Escape). Returns true if it consumed the
   * event so the host can early-return.
   */
  onKeyDown: (event: React.KeyboardEvent) => boolean;
  /** Programmatically pick a command by reference. */
  pick: (command: SlashCommand) => void;
  /** Programmatically pick a command by index into `items`. */
  pickAt: (index: number) => void;
  /** Set the highlighted row (used for hover). */
  setSelectedIndex: (index: number) => void;
  /** Close the menu without picking. */
  close: () => void;
}

/** Returns true when the value should trigger the slash menu. */
function shouldShow(value: string): boolean {
  if (!value.startsWith('/')) return false;
  // Only show while the user is typing the command head — abort once they
  // type a space (i.e. they've moved on to args).
  return !value.includes(' ');
}

export function useSlashMenu(opts: UseSlashMenuOptions): SlashMenuApi {
  const { setValue } = opts;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndexState] = useState(0);

  // Cache the last value forwarded so we can use it when picking via the API.
  const lastValueRef = useRef('');

  const items = useMemo<SlashCommand[]>(() => {
    if (!open) return [];
    return query.length <= 1 ? SLASH_COMMANDS : filterCommands(query);
  }, [open, query]);

  // Keep selectedIndex in bounds whenever the list changes.
  useEffect(() => {
    if (!open) return;
    if (selectedIndex >= items.length) {
      setSelectedIndexState(items.length === 0 ? 0 : items.length - 1);
    }
  }, [items, open, selectedIndex]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelectedIndexState(0);
  }, []);

  const onInputChange = useCallback((value: string) => {
    lastValueRef.current = value;
    if (shouldShow(value)) {
      setOpen(true);
      setQuery(value);
      setSelectedIndexState(0);
    } else {
      // Use functional setter to avoid stale closure when called many times.
      setOpen((wasOpen) => {
        if (!wasOpen) return wasOpen;
        return false;
      });
      setQuery('');
    }
  }, []);

  const pick = useCallback(
    (command: SlashCommand) => {
      // Always populate the input with `/<name> ` so the user can keep typing
      // arguments. The host is responsible for executing the command on
      // Enter (or when the user explicitly hits send).
      setValue(`${command.name} `);
      lastValueRef.current = `${command.name} `;
      close();
    },
    [setValue, close]
  );

  const pickAt = useCallback(
    (index: number) => {
      const cmd = items[index];
      if (cmd) pick(cmd);
    },
    [items, pick]
  );

  const setSelectedIndex = useCallback((index: number) => {
    setSelectedIndexState(index);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent): boolean => {
      if (!open || items.length === 0) return false;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndexState((i) => (i < items.length - 1 ? i + 1 : 0));
          return true;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndexState((i) => (i > 0 ? i - 1 : items.length - 1));
          return true;
        case 'Enter':
        case 'Tab': {
          event.preventDefault();
          const cmd = items[selectedIndex];
          if (cmd) pick(cmd);
          return true;
        }
        case 'Escape':
          event.preventDefault();
          close();
          return true;
        default:
          return false;
      }
    },
    [open, items, selectedIndex, pick, close]
  );

  return {
    open,
    items,
    selectedIndex,
    query,
    onInputChange,
    onKeyDown,
    pick,
    pickAt,
    setSelectedIndex,
    close,
  };
}
