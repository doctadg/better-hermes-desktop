/**
 * Compare feature — entry screen for "Model A/B compare".
 *
 * Two distinct visual states:
 *
 *   1. Pre-start: a centered card with two `ModelPicker`s side-by-side
 *      and "Start compare" / "Reset" buttons. The user picks two models
 *      and presses Start.
 *
 *   2. Post-start: a slim header bar showing the active pair, a single
 *      shared input, send-to-both and stop-both controls, and the
 *      live `CompareMetrics` strip pinned at the bottom.
 *
 * The shell is expected to keep this screen visible while compare is
 * active — the actual chat output is rendered by the existing 2x1 pane
 * layout (already bound by `useCompareSession.start`). This screen sits
 * above that layout and provides the synchronized input + metrics chip.
 */

import { useCallback, useState } from 'react';
import { Columns2, Play, RotateCcw } from 'lucide-react';
import { providerLabel } from '@/features/models/providers';
import type { ModelRow } from '@/features/models/types';
import { ModelPicker } from './ModelPicker';
import { CompareMetrics } from './CompareMetrics';
import { useCompareSession } from './useCompareSession';

export function CompareScreen() {
  const compare = useCompareSession();
  const [leftPick, setLeftPick] = useState<ModelRow | null>(null);
  const [rightPick, setRightPick] = useState<ModelRow | null>(null);
  const [draft, setDraft] = useState('');

  const canStart = leftPick != null && rightPick != null && leftPick.id !== rightPick.id;
  const inFlight = compare.isStreaming.left || compare.isStreaming.right;

  const handleStart = useCallback(() => {
    if (!leftPick || !rightPick) return;
    compare.start(leftPick, rightPick);
  }, [compare, leftPick, rightPick]);

  const handleReset = useCallback(() => {
    compare.reset();
    setLeftPick(null);
    setRightPick(null);
    setDraft('');
  }, [compare]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await compare.sendBoth(text);
  }, [compare, draft]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!inFlight && draft.trim()) void handleSend();
      }
    },
    [draft, handleSend, inFlight],
  );

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {compare.config ? (
        <ActiveHeader
          leftName={compare.config.left.name}
          leftSub={`${providerLabel(compare.config.left.provider)} · ${compare.config.left.model}`}
          rightName={compare.config.right.name}
          rightSub={`${providerLabel(compare.config.right.provider)} · ${compare.config.right.model}`}
          onReset={handleReset}
          onStop={compare.stopBoth}
          inFlight={inFlight}
        />
      ) : (
        <SetupHeader />
      )}

      <div className="flex-1 overflow-y-auto">
        {compare.config ? (
          <ActiveBody
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            onKey={handleKey}
            inFlight={inFlight}
            error={compare.error}
          />
        ) : (
          <SetupBody
            leftPick={leftPick}
            rightPick={rightPick}
            onLeftChange={setLeftPick}
            onRightChange={setRightPick}
            canStart={canStart}
            onStart={handleStart}
            onReset={handleReset}
            sameModelWarning={
              leftPick != null && rightPick != null && leftPick.id === rightPick.id
            }
          />
        )}
      </div>

      {compare.config && (
        <CompareMetrics
          left={compare.config.left}
          right={compare.config.right}
          metrics={compare.metrics}
          isStreaming={compare.isStreaming}
        />
      )}
    </div>
  );
}

// ─── Setup state ────────────────────────────────────────────────────────

function SetupHeader() {
  return (
    <div className="shrink-0 border-b border-zinc-800 px-4 py-3 flex items-center gap-2">
      <Columns2 size={16} className="text-amber-500" />
      <h2 className="text-sm font-semibold text-zinc-100">A/B Compare</h2>
      <span className="text-xs text-zinc-600">
        Send the same prompt to two models, side by side.
      </span>
    </div>
  );
}

interface SetupBodyProps {
  leftPick: ModelRow | null;
  rightPick: ModelRow | null;
  onLeftChange: (m: ModelRow) => void;
  onRightChange: (m: ModelRow) => void;
  canStart: boolean;
  onStart: () => void;
  onReset: () => void;
  sameModelWarning: boolean;
}

function SetupBody({
  leftPick,
  rightPick,
  onLeftChange,
  onRightChange,
  canStart,
  onStart,
  onReset,
  sameModelWarning,
}: SetupBodyProps) {
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-sm font-semibold text-zinc-100">
            Pick two models to compare
          </div>
          <p className="text-xs text-zinc-500">
            Each model gets its own session in a 2×1 pane layout. The same
            prompt is sent to both — outputs, latency, tokens, and cost
            stream side-by-side.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ModelPicker
            label="Model A"
            value={leftPick}
            onChange={onLeftChange}
            placeholder="Choose model A..."
          />
          <ModelPicker
            label="Model B"
            value={rightPick}
            onChange={onRightChange}
            placeholder="Choose model B..."
          />
        </div>

        {sameModelWarning && (
          <div className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800 rounded-lg px-3 py-2">
            Both sides reference the same model — pick a different one for
            side B to make the comparison meaningful.
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors duration-150"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={14} />
            Start compare
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Active state ───────────────────────────────────────────────────────

interface ActiveHeaderProps {
  leftName: string;
  leftSub: string;
  rightName: string;
  rightSub: string;
  onReset: () => void;
  onStop: () => void;
  inFlight: boolean;
}

function ActiveHeader({
  leftName,
  leftSub,
  rightName,
  rightSub,
  onReset,
  onStop,
  inFlight,
}: ActiveHeaderProps) {
  return (
    <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Columns2 size={16} className="text-amber-500" />
          <span className="text-sm font-semibold text-zinc-100">A/B Compare</span>
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
          <SidePill side="A" name={leftName} sub={leftSub} />
          <SidePill side="B" name={rightName} sub={rightSub} />
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {inFlight && (
            <button
              type="button"
              onClick={onStop}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-amber-500 hover:text-amber-400 transition-colors duration-150"
            >
              Stop both
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors duration-150"
            title="Pick different models"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function SidePill({ side, name, sub }: { side: 'A' | 'B'; name: string; sub: string }) {
  return (
    <div className="min-w-0 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500 shrink-0">
        {side}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-zinc-100 truncate">{name}</div>
        <div className="text-[10px] font-mono text-zinc-500 truncate">{sub}</div>
      </div>
    </div>
  );
}

interface ActiveBodyProps {
  draft: string;
  onDraftChange: (v: string) => void;
  onSend: () => void | Promise<void>;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inFlight: boolean;
  error: string | null;
}

function ActiveBody({
  draft,
  onDraftChange,
  onSend,
  onKey,
  inFlight,
  error,
}: ActiveBodyProps) {
  return (
    <div className="px-4 py-4 max-w-4xl mx-auto space-y-3">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wide font-medium text-zinc-500">
          Send the same prompt to both
        </div>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a prompt and press Enter to fire it at both models..."
          rows={4}
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500 outline-none transition-colors duration-150 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-600">
            Each pane streams independently — switch the active model on
            either pane (in its picker) to refine the test.
          </span>
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={inFlight || !draft.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={14} />
            {inFlight ? 'Streaming...' : 'Send to both'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <p className="text-[11px] text-zinc-600 leading-relaxed">
        Tip: the chat output for each side is rendered by the dual-pane
        layout (2×1) below or in your main chat view. This screen owns
        the synchronized input + the live metrics chip at the bottom.
      </p>
    </div>
  );
}
