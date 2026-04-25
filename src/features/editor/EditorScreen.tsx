/**
 * EditorScreen — split-pane code editor with file tree, tab bar, and
 * status bar. Uses CodeMirror 6 under the hood.
 */

import { useState, useCallback, useMemo } from 'react';
import { X, FileText } from 'lucide-react';
import { FileTree, type TreeNode } from './FileTree';
import { CodeMirrorEditor, type EditorLanguage } from './CodeMirrorEditor';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OpenFile {
  path: string;
  name: string;
  language: EditorLanguage;
  content: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extToLanguage(filename: string): EditorLanguage {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'js':
      return 'js';
    case 'jsx':
      return 'jsx';
    case 'ts':
      return 'ts';
    case 'tsx':
      return 'tsx';
    case 'py':
      return 'py';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'json':
      return 'json';
    case 'md':
      return 'md';
    case 'yaml':
    case 'yml':
      return 'yaml';
    default:
      return 'js';
  }
}

function languageLabel(lang: EditorLanguage): string {
  switch (lang) {
    case 'js':
      return 'JavaScript';
    case 'jsx':
      return 'JavaScript (JSX)';
    case 'ts':
      return 'TypeScript';
    case 'tsx':
      return 'TypeScript (JSX)';
    case 'py':
      return 'Python';
    case 'css':
      return 'CSS';
    case 'html':
      return 'HTML';
    case 'json':
      return 'JSON';
    case 'md':
      return 'Markdown';
    case 'yaml':
      return 'YAML';
    default:
      return 'Plain Text';
  }
}

/* Placeholder demo content per language */
function demoContent(path: string): string {
  const name = path.split('/').pop() ?? path;
  if (name === 'App.tsx')
    return `import React from 'react';\n\nexport default function App() {\n  return <div>Hello, world!</div>;\n}\n`;
  if (name.endsWith('.json'))
    return `{\n  "name": "my-project",\n  "version": "1.0.0"\n}\n`;
  if (name.endsWith('.css'))
    return `body {\n  margin: 0;\n  font-family: sans-serif;\n}\n`;
  if (name.endsWith('.md'))
    return `# README\n\nWelcome to the project.\n`;
  if (name.endsWith('.py'))
    return `def main():\n    print("Hello, world!")\n\nif __name__ == "__main__":\n    main()\n`;
  return `// ${path}\n`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EditorScreen() {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [treeWidth] = useState(250);

  // Connected state (placeholder — will come from a store/hook later)
  const connected = false;

  const activeFile = useMemo(() => openFiles.find((f) => f.path === activePath) ?? null, [openFiles, activePath]);

  /* ---- Handlers ---- */

  const handleFileClick = useCallback(
    (path: string) => {
      // Already open?
      if (openFiles.some((f) => f.path === path)) {
        setActivePath(path);
        return;
      }

      const name = path.split('/').pop() ?? path;
      const language = extToLanguage(name);
      const content = demoContent(path);

      setOpenFiles((prev) => [...prev, { path, name, language, content }]);
      setActivePath(path);
    },
    [openFiles],
  );

  const handleCloseTab = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenFiles((prev) => {
        const idx = prev.findIndex((f) => f.path === path);
        const next = prev.filter((f) => f.path !== path);
        // If closing the active tab, activate neighbour
        if (path === activePath && next.length > 0) {
          const newIdx = Math.min(idx, next.length - 1);
          setActivePath(next[newIdx].path);
        } else if (next.length === 0) {
          setActivePath(null);
        }
        return next;
      });
    },
    [activePath],
  );

  const handleContentChange = useCallback(
    (value: string) => {
      if (!activePath) return;
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === activePath ? { ...f, content: value } : f)),
      );
    },
    [activePath],
  );

  /* ---- Breadcrumb ---- */

  const breadcrumbParts = activeFile ? activeFile.path.split('/') : [];

  /* ---- Line / column ---- */

  // We don't track cursor position from CodeMirror in this simplified version;
  // show total line count from content.
  const lineCount = activeFile ? activeFile.content.split('\n').length : 0;

  return (
    <div className="h-full flex bg-zinc-950 text-zinc-100">
      {/* ── File tree pane ── */}
      <div
        className="shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950"
        style={{ width: treeWidth }}
      >
        <FileTree onFileClick={handleFileClick} connected={connected} />
      </div>

      {/* ── Editor area ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {openFiles.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <FileText size={40} className="text-zinc-700 mx-auto" />
              <p className="text-zinc-500 text-sm">No file open</p>
              <p className="text-zinc-600 text-xs">Click a file in the tree to start editing</p>
            </div>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="shrink-0 flex items-center bg-zinc-900 border-b border-zinc-800 overflow-x-auto">
              {openFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => setActivePath(file.path)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] border-r border-zinc-800 shrink-0 transition-colors duration-100 ${
                    file.path === activePath
                      ? 'bg-zinc-950 text-zinc-200'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <span
                    onClick={(e) => handleCloseTab(file.path, e)}
                    className="ml-1 p-0.5 rounded hover:bg-zinc-700/50 text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <X size={12} />
                  </span>
                </button>
              ))}
            </div>

            {/* Breadcrumb */}
            <div className="shrink-0 flex items-center gap-1 px-3 py-1 bg-zinc-950 border-b border-zinc-800 text-[11px] text-zinc-600">
              {breadcrumbParts.map((part, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-zinc-700">/</span>}
                  <span className={i === breadcrumbParts.length - 1 ? 'text-zinc-400' : ''}>
                    {part}
                  </span>
                </span>
              ))}
            </div>

            {/* CodeMirror editor */}
            <div className="flex-1 min-h-0">
              {activeFile && (
                <CodeMirrorEditor
                  value={activeFile.content}
                  onChange={handleContentChange}
                  language={activeFile.language}
                />
              )}
            </div>
          </>
        )}

        {/* Status bar */}
        <div className="shrink-0 h-6 flex items-center px-3 border-t border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500 gap-4">
          {activeFile ? (
            <>
              <span>{languageLabel(activeFile.language)}</span>
              <span>
                {lineCount} line{lineCount !== 1 ? 's' : ''}
              </span>
              <span className="ml-auto truncate max-w-[300px]">{activeFile.path}</span>
            </>
          ) : (
            <span>No file selected</span>
          )}
        </div>
      </div>
    </div>
  );
}
