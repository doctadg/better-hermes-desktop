/**
 * CodeMirrorEditor — React wrapper around CodeMirror 6.
 *
 * Accepts value/onChange for controlled editing, plus a language hint that
 * maps to the appropriate @codemirror/lang-* extension. Uses the one-dark
 * theme to match the app's dark aesthetic.
 */

import { useRef, useEffect, useCallback } from 'react';
import { EditorState, Extension, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';

export type EditorLanguage = 'js' | 'ts' | 'jsx' | 'tsx' | 'py' | 'css' | 'html' | 'json' | 'md' | 'yaml';

interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  readOnly?: boolean;
  className?: string;
}

const languageCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

function getLanguageExtension(lang: EditorLanguage): Extension {
  switch (lang) {
    case 'js':
      return javascript();
    case 'ts':
      return javascript({ typescript: true });
    case 'jsx':
      return javascript({ jsx: true });
    case 'tsx':
      return javascript({ jsx: true, typescript: true });
    case 'py':
      return python();
    case 'css':
      return css();
    case 'html':
      return html();
    case 'json':
      return json();
    case 'md':
      return markdown();
    case 'yaml':
      // No official @codemirror/lang-yaml — fall back to plain text
      return [];
    default:
      return [];
  }
}

export function CodeMirrorEditor({ value, onChange, language = 'js', readOnly = false, className }: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isSettingValue = useRef(false);

  // Track latest onChange in a ref so the listener never goes stale
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const getExtensions = useCallback(
    (currentLang: EditorLanguage, currentReadOnly: boolean): Extension[] => [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      oneDark,
      languageCompartment.of(getLanguageExtension(currentLang)),
      readOnlyCompartment.of(EditorState.readOnly.of(currentReadOnly)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isSettingValue.current && onChangeRef.current) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace" },
      }),
    ],
    [],
  );

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: getExtensions(language, readOnly),
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      isSettingValue.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      isSettingValue.current = false;
    }
  }, [value]);

  // React to language changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageCompartment.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  // React to readOnly changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  // Handle container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      viewRef.current?.requestMeasure();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className ?? 'h-full w-full'}
    />
  );
}
