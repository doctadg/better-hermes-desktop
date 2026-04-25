/**
 * About — app metadata + repo link.
 *
 * Resolves the desktop app version from the main process via
 * `window.hermesAPI.getVersion()` once on mount. Platform comes from the
 * preload getter, which is sync.
 */
import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';

const REPO_URL = 'https://github.com/doctadg/better-hermes-desktop';

function platformLabel(p: string): string {
  switch (p) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return p;
  }
}

export function AboutSection(): React.JSX.Element {
  const [version, setVersion] = useState<string | null>(null);
  const platform = window.hermesAPI?.getPlatform?.() ?? 'unknown';

  useEffect(() => {
    let cancelled = false;
    window.hermesAPI
      ?.getVersion()
      .then((v: string) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center text-zinc-950">
            <Info size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-200">Hermes Desktop</div>
            <div className="text-xs text-zinc-500">{version ? `v${version}` : 'Loading version…'}</div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-xs pt-2 border-t border-zinc-800">
          <dt className="text-zinc-500">Platform</dt>
          <dd className="text-zinc-300 font-mono">{platformLabel(platform)}</dd>
          <dt className="text-zinc-500">Engine</dt>
          <dd className="text-zinc-300 font-mono">Electron + React + Vite</dd>
        </dl>
      </div>

      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="text-xs text-zinc-500 mb-2">Source</div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline break-all"
        >
          {REPO_URL}
        </a>
      </div>
    </div>
  );
}

export default AboutSection;
