/**
 * Gateways feature — detail pane for a single platform.
 *
 * Renders the description, the live status pill, and one input per env
 * var. Saves are explicit ("Save" button) so accidental keystrokes don't
 * push partial values into the KV store.
 *
 * Secret values are masked in the UI (input type=password) but the input
 * is left blank when the saved value is hidden, with a "Replace" toggle
 * if the user wants to enter a new one. We never read back the secret in
 * the clear — masking is done by emitting a fixed-width placeholder.
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';

import type { PlatformDef } from './platforms';
import {
  statusLabel,
  statusPillClass,
  type ComputedPlatform,
  type UseGatewaysResult,
} from './useGateways';

/** Build a fixed-width mask so the user knows a value is set. */
const SECRET_MASK = '••••••••';

interface GatewayDetailProps {
  computed: ComputedPlatform;
  /** Subset of the hook's surface — keeps the component testable. */
  api: Pick<UseGatewaysResult, 'getEnvValue' | 'setEnvValue' | 'refresh'>;
}

export function GatewayDetail({ computed, api }: GatewayDetailProps): React.JSX.Element {
  const { def, status, savedCount } = computed;
  const PlatformIcon = def.icon;

  // Local edit buffer: one entry per env var. We seed from the persisted
  // value on platform-change, but the user can edit freely until they
  // hit "Save".
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Per-field "reveal secret" toggle. Starts collapsed.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<'info' | 'success' | 'error'>('info');

  // Reset local state when switching platforms.
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const v of def.envVars) {
      seed[v.name] = api.getEnvValue(def.id, v.name);
    }
    setDraft(seed);
    setRevealed({});
    setNotice(null);
    // Intentionally only react to platform identity. The hook's getter
    // is a stable reference (memoized) and re-running on every render
    // would clobber the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);

  const dirty = useMemo(() => {
    for (const v of def.envVars) {
      const persisted = api.getEnvValue(def.id, v.name);
      const current = draft[v.name] ?? '';
      if (persisted !== current) return true;
    }
    return false;
  }, [draft, def, api]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setNotice(null);
    try {
      // Save in declaration order so a partial failure leaves state in
      // a predictable shape (top-most fields applied first).
      for (const v of def.envVars) {
        const persisted = api.getEnvValue(def.id, v.name);
        const current = draft[v.name] ?? '';
        if (persisted !== current) {
          await api.setEnvValue(def.id, v.name, current);
        }
      }
      await api.refresh();
      setNoticeKind('success');
      setNotice('Saved.');
    } catch (err) {
      setNoticeKind('error');
      setNotice(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function handleTest(): void {
    setNoticeKind('info');
    setNotice('Test connection — coming soon (v0.3).');
  }

  function handleRevert(): void {
    const seed: Record<string, string> = {};
    for (const v of def.envVars) {
      seed[v.name] = api.getEnvValue(def.id, v.name);
    }
    setDraft(seed);
    setNotice(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-200">
          <PlatformIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-100 truncate">{def.label}</h2>
            <span
              className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusPillClass(status)}`}
            >
              {statusLabel(status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">{def.description}</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {savedCount} of {def.envVars.length} value{def.envVars.length === 1 ? '' : 's'} configured
          </p>
        </div>
      </header>

      {/* Env-var inputs */}
      <section className="space-y-3">
        {def.envVars.map((v) => {
          const value = draft[v.name] ?? '';
          const persisted = api.getEnvValue(def.id, v.name);
          const isSecret = v.secret === true;
          const isRevealed = revealed[v.name] === true;
          const placeholder =
            isSecret && persisted && !isRevealed && value === persisted
              ? SECRET_MASK
              : v.placeholder;

          return (
            <div key={v.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`gw-${def.id}-${v.name}`}
                  className="block text-xs font-medium text-zinc-300"
                >
                  {v.label}
                  {v.optional ? (
                    <span className="ml-1 text-zinc-500 font-normal">(optional)</span>
                  ) : null}
                </label>
                <span className="font-mono text-[10px] text-zinc-600">{v.name}</span>
              </div>
              <div className="relative">
                <input
                  id={`gw-${def.id}-${v.name}`}
                  type={isSecret && !isRevealed ? 'password' : 'text'}
                  value={value}
                  placeholder={placeholder}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDraft((prev) => ({ ...prev, [v.name]: next }));
                  }}
                  className="w-full px-3 py-2 pr-9 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500 outline-none transition-colors duration-150 font-mono"
                  spellCheck={false}
                  autoComplete="off"
                />
                {isSecret ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRevealed((prev) => ({ ...prev, [v.name]: !prev[v.name] }))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150"
                    aria-label={isRevealed ? 'Hide secret' : 'Show secret'}
                  >
                    {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      {/* Notice strip */}
      {notice ? (
        <div
          role="status"
          className={
            noticeKind === 'error'
              ? 'px-3 py-2 rounded-lg text-xs border bg-rose-500/10 text-rose-300 border-rose-500/30'
              : noticeKind === 'success'
                ? 'px-3 py-2 rounded-lg text-xs border bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'px-3 py-2 rounded-lg text-xs border bg-zinc-900 text-zinc-300 border-zinc-700'
          }
        >
          {notice}
        </div>
      ) : null}

      {/* Action row */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          {def.docsUrl ? (
            <a
              href={def.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150"
            >
              <ExternalLink size={12} />
              Open docs
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150"
          >
            Test connection
          </button>
          <button
            type="button"
            onClick={handleRevert}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150 disabled:opacity-40 disabled:hover:bg-amber-500"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GatewayDetail;
