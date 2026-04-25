import { useState, useCallback } from 'react';
import { DiffViewer } from './DiffViewer';

export interface DiffScreenProps {
  onClose?: () => void;
}

const SAMPLE_OLD = `function hello() {
  console.log("Hello, world!");
  return true;
}

function add(a, b) {
  return a + b;
}`;

const SAMPLE_NEW = `function hello(name: string = "world") {
  console.log(\`Hello, \${name}!\`);
  return true;
}

function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}`;

export function DiffScreen({ onClose }: DiffScreenProps) {
  const [oldText, setOldText] = useState(SAMPLE_OLD);
  const [newText, setNewText] = useState(SAMPLE_NEW);
  const [fileName, setFileName] = useState('example.ts');

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleSwap = useCallback(() => {
    setOldText(newText);
    setNewText(oldText);
  }, [oldText, newText]);

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500">
            <path d="M9 12h6M12 9v6" />
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
          <span className="text-sm font-semibold text-zinc-300">Diff Viewer</span>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="File name"
            className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300 outline-none focus:border-amber-500/50 w-48"
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={handleSwap}
          className="px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
          title="Swap old ↔ new"
        >
          ⇄ Swap
        </button>

        {onClose && (
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {/* Editor area + Diff */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: editable text areas */}
        <div className="w-80 shrink-0 flex flex-col border-r border-zinc-800">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/30">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Old Text</span>
          </div>
          <textarea
            value={oldText}
            onChange={(e) => setOldText(e.target.value)}
            className="flex-1 bg-zinc-950 text-xs font-mono text-zinc-300 p-3 outline-none resize-none border-none leading-5"
            placeholder="Paste original text..."
            spellCheck={false}
          />
          <div className="px-3 py-2 border-t border-b border-zinc-800 bg-zinc-900/30">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">New Text</span>
          </div>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className="flex-1 bg-zinc-950 text-xs font-mono text-zinc-300 p-3 outline-none resize-none border-none leading-5"
            placeholder="Paste modified text..."
            spellCheck={false}
          />
        </div>

        {/* Right: diff output */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <DiffViewer
            oldText={oldText}
            newText={newText}
            fileName={fileName}
            language={fileName?.split('.').pop()}
          />
        </div>
      </div>
    </div>
  );
}

export default DiffScreen;
