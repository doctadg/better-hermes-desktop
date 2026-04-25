import { useState, useMemo, useCallback } from 'react';
import * as Diff from 'diff';

export interface DiffViewerProps {
  oldText: string;
  newText: string;
  language?: string;
  fileName?: string;
}

type ViewMode = 'unified' | 'side-by-side';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function computeDiffLines(oldText: string, newText: string): DiffLine[] {
  const changes = Diff.diffLines(oldText, newText);
  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const changeLines = change.value.replace(/\n$/, '').split('\n');

    if (change.added) {
      for (const line of changeLines) {
        lines.push({ type: 'added', content: line, newLineNo: newLine++ });
      }
    } else if (change.removed) {
      for (const line of changeLines) {
        lines.push({ type: 'removed', content: line, oldLineNo: oldLine++ });
      }
    } else {
      for (const line of changeLines) {
        lines.push({ type: 'unchanged', content: line, oldLineNo: oldLine++, newLineNo: newLine++ });
      }
    }
  }
  return lines;
}

function computeStats(lines: DiffLine[]) {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'added') added++;
    if (line.type === 'removed') removed++;
  }
  return { added, removed };
}

export function DiffViewer({ oldText, newText, language, fileName }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const lines = useMemo(() => computeDiffLines(oldText, newText), [oldText, newText]);
  const stats = useMemo(() => computeStats(lines), [lines]);

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === 'unified' ? 'side-by-side' : 'unified'));
  }, []);

  const isEmpty = oldText === '' && newText === '';
  const isNewFile = oldText === '' && newText !== '';
  const isDeleted = oldText !== '' && newText === '';
  const hasChanges = stats.added > 0 || stats.removed > 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col h-full bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
        <DiffHeader
          fileName={fileName}
          stats={stats}
          viewMode={viewMode}
          onToggleView={toggleViewMode}
          hasChanges={false}
        />
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm py-16">
          <div className="text-center space-y-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-700 mx-auto">
              <path d="M9 12h6M12 9v6" />
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            <p>No content to compare</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
      <DiffHeader
        fileName={fileName}
        stats={stats}
        viewMode={viewMode}
        onToggleView={toggleViewMode}
        hasChanges={hasChanges}
        badge={isNewFile ? 'New file' : isDeleted ? 'Deleted file' : undefined}
        language={language}
      />

      <div className="flex-1 overflow-auto text-xs font-mono">
        {viewMode === 'unified' ? (
          <UnifiedView lines={lines} />
        ) : (
          <SideBySideView lines={lines} />
        )}
      </div>
    </div>
  );
}

/* ─── Header ─── */

function DiffHeader({
  fileName,
  stats,
  viewMode,
  onToggleView,
  hasChanges,
  badge,
  language,
}: {
  fileName?: string;
  stats: { added: number; removed: number };
  viewMode: ViewMode;
  onToggleView: () => void;
  hasChanges: boolean;
  badge?: string;
  language?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800 shrink-0">
      {fileName && (
        <span className="text-sm font-medium text-zinc-300 truncate">
          📄 {fileName}
        </span>
      )}
      {language && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
          {language}
        </span>
      )}
      {badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
          {badge}
        </span>
      )}
      {hasChanges && (
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-emerald-400">+{stats.added}</span>
          <span className="text-red-400">-{stats.removed}</span>
        </div>
      )}
      <div className="flex-1" />
      <div className="flex items-center bg-zinc-800 rounded-md p-0.5 border border-zinc-700">
        <button
          onClick={() => viewMode !== 'unified' && onToggleView()}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            viewMode === 'unified'
              ? 'bg-zinc-700 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Unified
        </button>
        <button
          onClick={() => viewMode !== 'side-by-side' && onToggleView()}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            viewMode === 'side-by-side'
              ? 'bg-zinc-700 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Split
        </button>
      </div>
    </div>
  );
}

/* ─── Unified View ─── */

function UnifiedView({ lines }: { lines: DiffLine[] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((line, i) => (
          <tr
            key={i}
            className={
              line.type === 'added'
                ? 'bg-emerald-500/10'
                : line.type === 'removed'
                  ? 'bg-red-500/10'
                  : ''
            }
          >
            <td className="w-[1%] px-2 py-0 text-right text-zinc-600 select-none border-r border-zinc-800/50 whitespace-nowrap">
              {line.oldLineNo ?? ''}
            </td>
            <td className="w-[1%] px-2 py-0 text-right text-zinc-600 select-none border-r border-zinc-800/50 whitespace-nowrap">
              {line.newLineNo ?? ''}
            </td>
            <td className="w-[1%] px-2 py-0 select-none whitespace-nowrap">
              {line.type === 'added' ? (
                <span className="text-emerald-400">+</span>
              ) : line.type === 'removed' ? (
                <span className="text-red-400">-</span>
              ) : (
                <span className="text-zinc-700">&nbsp;</span>
              )}
            </td>
            <td
              className={`px-3 py-0 whitespace-pre ${
                line.type === 'added'
                  ? 'text-emerald-300'
                  : line.type === 'removed'
                    ? 'text-red-300'
                    : 'text-zinc-400'
              }`}
            >
              {line.content}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Side-by-Side View ─── */

function SideBySideView({ lines }: { lines: DiffLine[] }) {
  // Build left (old) and right (new) columns aligned
  const leftLines: (DiffLine & { lineNo?: number })[] = [];
  const rightLines: (DiffLine & { lineNo?: number })[] = [];

  // Group consecutive added/removed as pairs
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'unchanged') {
      leftLines.push({ ...line, lineNo: line.oldLineNo });
      rightLines.push({ ...line, lineNo: line.newLineNo });
      i++;
    } else if (line.type === 'removed') {
      // Collect consecutive removed then added
      const removedBatch: DiffLine[] = [];
      const addedBatch: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'removed') {
        removedBatch.push(lines[i]);
        i++;
      }
      while (i < lines.length && lines[i].type === 'added') {
        addedBatch.push(lines[i]);
        i++;
      }
      const maxLen = Math.max(removedBatch.length, addedBatch.length);
      for (let j = 0; j < maxLen; j++) {
        if (j < removedBatch.length) {
          leftLines.push({ ...removedBatch[j], lineNo: removedBatch[j].oldLineNo });
        } else {
          leftLines.push({ type: 'unchanged', content: '', lineNo: undefined });
        }
        if (j < addedBatch.length) {
          rightLines.push({ ...addedBatch[j], lineNo: addedBatch[j].newLineNo });
        } else {
          rightLines.push({ type: 'unchanged', content: '', lineNo: undefined });
        }
      }
    } else if (line.type === 'added') {
      leftLines.push({ type: 'unchanged', content: '', lineNo: undefined });
      rightLines.push({ ...line, lineNo: line.newLineNo });
      i++;
    } else {
      i++;
    }
  }

  return (
    <div className="flex w-full">
      {/* Left pane (old) */}
      <div className="flex-1 min-w-0 border-r border-zinc-700">
        <div className="px-3 py-1.5 bg-zinc-900/50 text-[10px] text-zinc-500 uppercase tracking-wider border-b border-zinc-800 text-center font-sans">
          Old
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {leftLines.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === 'removed'
                    ? 'bg-red-500/10'
                    : ''
                }
              >
                <td className="w-[1%] px-2 py-0 text-right text-zinc-600 select-none whitespace-nowrap border-r border-zinc-800/50">
                  {line.lineNo ?? ''}
                </td>
                <td
                  className={`px-3 py-0 whitespace-pre ${
                    line.type === 'removed' ? 'text-red-300' : 'text-zinc-400'
                  }`}
                >
                  {line.content}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Right pane (new) */}
      <div className="flex-1 min-w-0">
        <div className="px-3 py-1.5 bg-zinc-900/50 text-[10px] text-zinc-500 uppercase tracking-wider border-b border-zinc-800 text-center font-sans">
          New
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {rightLines.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === 'added'
                    ? 'bg-emerald-500/10'
                    : ''
                }
              >
                <td className="w-[1%] px-2 py-0 text-right text-zinc-600 select-none whitespace-nowrap border-r border-zinc-800/50">
                  {line.lineNo ?? ''}
                </td>
                <td
                  className={`px-3 py-0 whitespace-pre ${
                    line.type === 'added' ? 'text-emerald-300' : 'text-zinc-400'
                  }`}
                >
                  {line.content}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DiffViewer;
