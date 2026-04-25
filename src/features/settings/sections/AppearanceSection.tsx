/**
 * Appearance — theme + accent color.
 *
 * Persists to the main-process electron-store under the keys `theme` and
 * `accent`. Side-effects (toggling document classes) are applied
 * immediately on change so the UI feedback is instant; the persisted
 * values are picked up by the global shell on next launch.
 *
 * Theme: 'system' | 'dark' | 'light'. We always carry a 'dark' class on
 * <html> for our Tailwind dark-by-default palette; for 'light' we strip
 * it; for 'system' we follow the OS preference via matchMedia.
 *
 * Accent: one of six swatches. Persists raw token; we set a single
 * `accent-<token>` class on <html> so downstream styles can pick it up.
 */
import { useCallback, useEffect, useState } from 'react';

type Theme = 'system' | 'dark' | 'light';
type Accent = 'amber' | 'blue' | 'emerald' | 'violet' | 'rose' | 'slate';

const THEMES: ReadonlyArray<{ id: Theme; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

interface AccentDef {
  id: Accent;
  label: string;
  /** Tailwind class used for the swatch fill. */
  swatch: string;
  /** Tailwind class used for the active ring color. */
  ring: string;
}

const ACCENTS: ReadonlyArray<AccentDef> = [
  { id: 'amber', label: 'Amber', swatch: 'bg-amber-500', ring: 'ring-amber-400' },
  { id: 'blue', label: 'Blue', swatch: 'bg-blue-500', ring: 'ring-blue-400' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500', ring: 'ring-emerald-400' },
  { id: 'violet', label: 'Violet', swatch: 'bg-violet-500', ring: 'ring-violet-400' },
  { id: 'rose', label: 'Rose', swatch: 'bg-rose-500', ring: 'ring-rose-400' },
  { id: 'slate', label: 'Slate', swatch: 'bg-slate-500', ring: 'ring-slate-400' },
];

const ACCENT_IDS: ReadonlySet<string> = new Set(ACCENTS.map((a) => a.id));

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }
}

function applyAccent(accent: Accent): void {
  const root = document.documentElement;
  // Strip any pre-existing accent-* class before adding the new one.
  Array.from(root.classList)
    .filter((c) => c.startsWith('accent-'))
    .forEach((c) => root.classList.remove(c));
  root.classList.add(`accent-${accent}`);
}

export function AppearanceSection(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>('system');
  const [accent, setAccent] = useState<Accent>('amber');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from store on mount.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.hermesAPI?.storeGet<string>('theme'),
      window.hermesAPI?.storeGet<string>('accent'),
    ]).then(([t, a]) => {
      if (cancelled) return;
      const nextTheme: Theme = t === 'dark' || t === 'light' || t === 'system' ? t : 'system';
      const nextAccent: Accent = a && ACCENT_IDS.has(a) ? (a as Accent) : 'amber';
      setTheme(nextTheme);
      setAccent(nextAccent);
      setHydrated(true);
    });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const handleThemeChange = useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
    void window.hermesAPI?.storeSet('theme', next);
  }, []);

  const handleAccentChange = useCallback((next: Accent) => {
    setAccent(next);
    applyAccent(next);
    void window.hermesAPI?.storeSet('accent', next);
  }, []);

  return (
    <div className="space-y-4">
      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">Theme</h3>
        <p className="text-xs text-zinc-500 mb-3">Choose how Hermes Desktop looks. System follows your OS preference.</p>
        <div className="flex items-center gap-2">
          {THEMES.map((t) => {
            const isActive = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleThemeChange(t.id)}
                disabled={!hydrated}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                    : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">Accent color</h3>
        <p className="text-xs text-zinc-500 mb-3">Highlight color for active states and primary actions.</p>
        <div className="flex items-center gap-2">
          {ACCENTS.map((a) => {
            const isActive = accent === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handleAccentChange(a.id)}
                disabled={!hydrated}
                title={a.label}
                aria-label={a.label}
                className={`w-7 h-7 rounded-full transition-all ${a.swatch} ${
                  isActive ? `ring-2 ring-offset-2 ring-offset-zinc-900 ${a.ring}` : 'opacity-70 hover:opacity-100'
                }`}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default AppearanceSection;
