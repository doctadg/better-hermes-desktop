/**
 * Network — proxy URL + force-IPv4 toggle.
 *
 * Persists to electron-store under `network.proxy` (string) and
 * `network.ipv4Only` (boolean). Enforcement (e.g. wiring these into
 * fetch/axios/Electron's `app.commandLine`) is intentionally out of scope
 * for v0.2 — this section is the source of truth, but downstream consumers
 * have not yet been retrofitted. Documented in INTEGRATION.md.
 */
import { useCallback, useEffect, useState } from 'react';

const KEY_PROXY = 'network.proxy';
const KEY_IPV4 = 'network.ipv4Only';

export function NetworkSection(): React.JSX.Element {
  const [proxy, setProxy] = useState('');
  const [ipv4Only, setIpv4Only] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.hermesAPI?.storeGet<string>(KEY_PROXY),
      window.hermesAPI?.storeGet<boolean>(KEY_IPV4),
    ]).then(([p, v4]) => {
      if (cancelled) return;
      setProxy(typeof p === 'string' ? p : '');
      setIpv4Only(v4 === true);
      setHydrated(true);
    });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const flashSaved = useCallback((key: string) => {
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
  }, []);

  const persistProxy = useCallback(async () => {
    await window.hermesAPI?.storeSet(KEY_PROXY, proxy.trim());
    flashSaved(KEY_PROXY);
  }, [proxy, flashSaved]);

  const handleIpv4Toggle = useCallback(
    async (next: boolean) => {
      setIpv4Only(next);
      await window.hermesAPI?.storeSet(KEY_IPV4, next);
      flashSaved(KEY_IPV4);
    },
    [flashSaved]
  );

  return (
    <div className="space-y-4">
      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">HTTP / SOCKS proxy</h3>
          {savedKey === KEY_PROXY && <span className="text-[10px] uppercase text-emerald-400">Saved</span>}
        </div>
        <input
          type="text"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          onBlur={persistProxy}
          disabled={!hydrated}
          placeholder="e.g. http://proxy:8080 or socks5://127.0.0.1:1080"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono text-zinc-100 outline-none focus:border-amber-500"
        />
        <p className="text-xs text-zinc-500">
          Saved as a preference. Outgoing HTTP/WS clients will pick it up once they are migrated to honor it
          (planned for v0.3).
        </p>
      </section>

      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-200">Force IPv4</h3>
              {savedKey === KEY_IPV4 && <span className="text-[10px] uppercase text-emerald-400">Saved</span>}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Disables IPv6 lookups for outbound connections. Helps on networks where IPv6 routes are broken.
              No active enforcement yet — the value is read on next app start by clients that opt in.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={ipv4Only}
              onChange={(e) => void handleIpv4Toggle(e.target.checked)}
              disabled={!hydrated}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-700 rounded-full peer-focus:ring-1 peer-focus:ring-amber-500 peer-checked:bg-amber-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-zinc-100 after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
          </label>
        </div>
      </section>
    </div>
  );
}

export default NetworkSection;
