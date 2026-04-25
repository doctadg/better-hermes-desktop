import { useEffect, useRef, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Network, Server, Activity } from 'lucide-react';

interface CpuTimes {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
}

interface CpuInfo {
  model: string;
  speed: number;
  times: CpuTimes;
}

interface DiskInfo {
  path: string;
  total: number;
  free: number;
  available: number;
}

interface NetworkInfo {
  name: string;
  address: string;
  family: string;
  mac: string;
  internal: boolean;
  cidr: string | null;
}

interface SystemInfo {
  cpus: CpuInfo[];
  cpuCount: number;
  totalmem: number;
  freemem: number;
  platform: string;
  arch: string;
  release: string;
  hostname: string;
  uptime: number;
  loadavg: number[];
  type: string;
  version: string;
  endianness: string;
  userInfo: { username: string; homedir: string; shell: string | null };
  disks: DiskInfo[];
  networks: NetworkInfo[];
  timestamp: number;
}

type HermesAPI = { system?: { getInfo: () => Promise<SystemInfo> } };

const POLL_MS = 1500;

function getApi(): HermesAPI | null {
  return (window as unknown as { hermesAPI?: HermesAPI }).hermesAPI ?? null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function platformLabel(p: string): string {
  switch (p) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    case 'freebsd':
      return 'FreeBSD';
    case 'openbsd':
      return 'OpenBSD';
    case 'sunos':
      return 'SunOS';
    case 'aix':
      return 'AIX';
    default:
      return p;
  }
}

function totalTicks(t: CpuTimes): number {
  return t.user + t.nice + t.sys + t.idle + t.irq;
}

function corePercent(prev: CpuTimes | undefined, curr: CpuTimes): number {
  if (!prev) return 0;
  const totalDiff = totalTicks(curr) - totalTicks(prev);
  const idleDiff = curr.idle - prev.idle;
  if (totalDiff <= 0) return 0;
  const pct = 1 - idleDiff / totalDiff;
  return Math.max(0, Math.min(1, pct)) * 100;
}

function usageColor(pct: number): string {
  if (pct >= 85) return 'bg-red-500';
  if (pct >= 60) return 'bg-amber-500';
  if (pct >= 30) return 'bg-emerald-500';
  return 'bg-emerald-600';
}

export function HardwareScreen() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coreUsage, setCoreUsage] = useState<number[]>([]);
  const prevTimesRef = useRef<CpuTimes[] | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    const api = getApi();
    if (!api?.system?.getInfo) {
      setError('System info unavailable: this build is not running inside Electron.');
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const next = await api.system!.getInfo();
        if (cancelledRef.current) return;

        const currTimes = next.cpus.map((c) => c.times);
        const prev = prevTimesRef.current;
        const usage = currTimes.map((t, i) => corePercent(prev?.[i], t));
        prevTimesRef.current = currTimes;

        setInfo(next);
        setCoreUsage(usage);
        setError(null);
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to read system info');
        }
      } finally {
        if (!cancelledRef.current) {
          timer = setTimeout(tick, POLL_MS);
        }
      }
    };

    tick();

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (error && !info) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm px-6">
        <div className="max-w-md text-center space-y-2">
          <Activity className="w-8 h-8 mx-auto text-zinc-700" />
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
        Reading hardware...
      </div>
    );
  }

  const memUsed = info.totalmem - info.freemem;
  const memPct = info.totalmem > 0 ? (memUsed / info.totalmem) * 100 : 0;
  const aggregateCpu =
    coreUsage.length > 0 ? coreUsage.reduce((a, b) => a + b, 0) / coreUsage.length : 0;

  const cpuModel = info.cpus[0]?.model.replace(/\s+/g, ' ').trim() ?? 'Unknown CPU';
  const cpuSpeedGhz = info.cpus[0]?.speed ? (info.cpus[0].speed / 1000).toFixed(2) : null;

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-200">Hardware</h2>
          <span className="text-xs text-zinc-600">
            {info.hostname} · {platformLabel(info.platform)} {info.arch}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* CPU */}
        <Card icon={<Cpu className="w-4 h-4" />} title="CPU" subtitle={cpuModel}>
          <div className="space-y-3">
            {/* Aggregate */}
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                <span>Total usage</span>
                <span className="text-zinc-300 font-mono">{aggregateCpu.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${usageColor(aggregateCpu)} transition-all duration-500 ease-out`}
                  style={{ width: `${aggregateCpu}%` }}
                />
              </div>
            </div>

            {/* Per-core grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
              {coreUsage.map((pct, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-600">
                    <span>#{i}</span>
                    <span className="font-mono">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${usageColor(pct)} transition-all duration-500 ease-out`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-800">
              <Stat label="Cores" value={String(info.cpuCount)} />
              <Stat label="Clock" value={cpuSpeedGhz ? `${cpuSpeedGhz} GHz` : '—'} />
              <Stat
                label="Load avg"
                value={
                  info.loadavg.length > 0 && info.loadavg.some((v) => v > 0)
                    ? info.loadavg.map((v) => v.toFixed(2)).join(' / ')
                    : '—'
                }
              />
            </div>
          </div>
        </Card>

        {/* Memory */}
        <Card
          icon={<MemoryStick className="w-4 h-4" />}
          title="Memory"
          subtitle={`${formatBytes(memUsed)} / ${formatBytes(info.totalmem)} used`}
        >
          <div className="space-y-2">
            <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${usageColor(memPct)} transition-all duration-500 ease-out`}
                style={{ width: `${memPct}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-800">
              <Stat label="Used" value={formatBytes(memUsed)} />
              <Stat label="Free" value={formatBytes(info.freemem)} />
              <Stat label="Total" value={formatBytes(info.totalmem)} />
            </div>
          </div>
        </Card>

        {/* Storage */}
        <Card
          icon={<HardDrive className="w-4 h-4" />}
          title="Storage"
          subtitle={`${info.disks.length} volume${info.disks.length === 1 ? '' : 's'}`}
        >
          {info.disks.length === 0 ? (
            <div className="text-xs text-zinc-600">No mounted volumes detected.</div>
          ) : (
            <div className="space-y-3">
              {info.disks.map((d) => {
                const used = d.total - d.free;
                const pct = d.total > 0 ? (used / d.total) * 100 : 0;
                return (
                  <div key={d.path} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-mono truncate" title={d.path}>
                        {d.path}
                      </span>
                      <span className="text-zinc-500 font-mono shrink-0 ml-3">
                        {formatBytes(used)} / {formatBytes(d.total)}{' '}
                        <span className="text-zinc-600">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${usageColor(pct)} transition-all duration-500 ease-out`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* System info */}
        <Card icon={<Server className="w-4 h-4" />} title="System">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Hostname" value={info.hostname} />
            <Stat label="OS" value={`${platformLabel(info.platform)} ${info.arch}`} />
            <Stat label="Kernel" value={info.release} />
            <Stat label="Uptime" value={formatUptime(info.uptime)} />
            <Stat label="User" value={info.userInfo.username || '—'} />
            <Stat label="Endianness" value={info.endianness} />
            {info.version && <Stat label="Version" value={info.version} fullWidth />}
            <Stat label="Home" value={info.userInfo.homedir} fullWidth />
          </div>
        </Card>

        {/* Network */}
        <Card
          icon={<Network className="w-4 h-4" />}
          title="Network"
          subtitle={`${info.networks.filter((n) => !n.internal).length} external interface${
            info.networks.filter((n) => !n.internal).length === 1 ? '' : 's'
          }`}
        >
          <div className="space-y-2">
            {info.networks.length === 0 ? (
              <div className="text-xs text-zinc-600">No network interfaces.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-600 border-b border-zinc-800">
                    <th className="text-left font-medium pb-1.5 pr-3">Interface</th>
                    <th className="text-left font-medium pb-1.5 pr-3">Family</th>
                    <th className="text-left font-medium pb-1.5 pr-3">Address</th>
                    <th className="text-left font-medium pb-1.5">MAC</th>
                  </tr>
                </thead>
                <tbody>
                  {info.networks.map((n, i) => (
                    <tr
                      key={`${n.name}-${n.address}-${i}`}
                      className={`border-b border-zinc-900 last:border-0 ${
                        n.internal ? 'text-zinc-600' : 'text-zinc-300'
                      }`}
                    >
                      <td className="py-1.5 pr-3 font-mono">
                        {n.name}
                        {n.internal && (
                          <span className="ml-1.5 text-[10px] text-zinc-700 uppercase">internal</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-zinc-500">{n.family}</td>
                      <td className="py-1.5 pr-3 font-mono">{n.address}</td>
                      <td className="py-1.5 font-mono text-zinc-500">
                        {n.mac && n.mac !== '00:00:00:00:00:00' ? n.mac : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800">
        <span className="text-amber-500">{icon}</span>
        <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">{title}</h3>
        {subtitle && <span className="text-xs text-zinc-500 truncate ml-1">{subtitle}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Stat({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'col-span-full' : ''}>
      <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-xs text-zinc-300 font-mono truncate" title={value}>
        {value}
      </div>
    </div>
  );
}
