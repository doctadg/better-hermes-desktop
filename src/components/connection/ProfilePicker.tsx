import { useState, useRef, useEffect, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection';

export function ProfilePicker() {
  const bridgeProfiles = useConnectionStore((s) => s.bridgeProfiles);
  const profileStatus = useConnectionStore((s) => s.profileStatus);
  const activeProfile = useConnectionStore((s) => s.activeProfile);
  const setActiveProfile = useConnectionStore((s) => s.setActiveProfile);
  const fetchBridgeProfiles = useConnectionStore((s) => s.fetchBridgeProfiles);
  const client = useConnectionStore((s) => s.client);
  const isSwitchingProfile = useConnectionStore((s) => s.isSwitchingProfile);
  const isInitialized = useConnectionStore((s) => s.isInitialized);

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-refresh profiles every 30s
  useEffect(() => {
    if (bridgeProfiles.length === 0) return;
    const interval = setInterval(() => {
      fetchBridgeProfiles().catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [bridgeProfiles.length, fetchBridgeProfiles]);

  // Restore profile on client when it hydrates from persist
  useEffect(() => {
    if (client && activeProfile) {
      client.setProfile(activeProfile);
    }
  }, [client, activeProfile]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    async (name: string | null) => {
      if (name === activeProfile) return; // same profile, skip
      setOpen(false);
      await setActiveProfile(name);
    },
    [setActiveProfile, activeProfile],
  );

  // Don't render if no bridge profiles detected yet
  if (bridgeProfiles.length === 0) return null;

  const currentProfile = activeProfile
    ? bridgeProfiles.find((p) => p.name === activeProfile)
    : null;
  const currentStatus = currentProfile ? profileStatus[currentProfile.name] : null;
  const defaultProfileName = bridgeProfiles.find((p) => p.is_default)?.name ?? 'default';

  const statusColor = (status: string) => {
    switch (status) {
      case 'up': return 'bg-emerald-500';
      case 'down': return 'bg-red-500';
      case 'degraded': return 'bg-amber-500';
      default: return 'bg-zinc-600';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'up': return 'up';
      case 'down': return 'down';
      case 'degraded': return 'degraded';
      default: return '?';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isSwitchingProfile}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-zinc-800 text-sm transition-all duration-150 ${
          isSwitchingProfile ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        {/* Profile icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500 shrink-0">
          <circle cx="8" cy="4" r="2.5" />
          <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        </svg>

        {/* Profile name or loading */}
        {isSwitchingProfile ? (
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="inline-block w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />
            Switching...
          </span>
        ) : (
          <span className="text-zinc-200">
            {currentProfile ? currentProfile.name : defaultProfileName}
          </span>
        )}

        {/* Status badge */}
        {currentStatus && !isSwitchingProfile && (
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <span className={`w-1.5 h-1.5 rounded-full ${statusColor(currentStatus)}`} />
            {statusLabel(currentStatus)}
          </span>
        )}

        {/* Chevron */}
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`shrink-0 text-zinc-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>

      {open && !isSwitchingProfile && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 py-1 animate-fade-in">
          {/* Auto (default) option */}
          <button
            onClick={() => handleSelect(null)}
            disabled={isSwitchingProfile}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-150 ${
              !activeProfile
                ? 'bg-amber-500/10 text-amber-400'
                : 'text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full shrink-0 bg-zinc-500" />
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">
                Auto
                <span className="ml-1.5 text-xs text-zinc-500 font-normal">
                  (defaults to {defaultProfileName})
                </span>
              </div>
            </div>
            {!activeProfile && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0">
                <path d="M3 8l4 4 6-7" />
              </svg>
            )}
          </button>

          {/* Profile entries */}
          {bridgeProfiles.map((p) => {
            const isActive = p.name === activeProfile;
            const status = profileStatus[p.name];

            return (
              <button
                key={p.name}
                onClick={() => handleSelect(p.name)}
                disabled={isSwitchingProfile}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor(status ?? 'unknown')}`} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium flex items-center gap-1.5">
                    {p.name}
                    {p.is_default && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-zinc-700 text-zinc-400 font-normal">
                        default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {p.url.replace('http://127.0.0.1:', '').replace('http://localhost:', '')}
                  </div>
                </div>
                <span className="text-xs text-zinc-500 shrink-0">
                  {statusLabel(status ?? 'unknown')}
                </span>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0">
                    <path d="M3 8l4 4 6-7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
