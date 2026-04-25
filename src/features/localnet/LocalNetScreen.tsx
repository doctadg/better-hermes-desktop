import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  RefreshCw,
  Printer,
  Thermometer,
  Pause,
  Play,
  Square,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Tag,
  Plus,
  Eye,
  Wifi,
  Radio,
} from 'lucide-react';
import { useConnectionStore } from '@/stores/connection';
import type { LocalNetDevice, LocalNetScanResult, BambuPrinterConfig, BambuPrinterStatus } from '@/api/types';

// ─── Helpers ───

function formatMac(mac: string): string {
  if (!mac || mac === '00:00:00:00:00:00') return '—';
  return mac.length > 17 ? mac.substring(0, 17) + '…' : mac;
}

function formatRemainingTime(minutes: number): string {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function tempColor(current: number, target: number): string {
  if (current >= 200) return 'text-red-400';
  if (current >= 100) return 'text-amber-400';
  if (target > 0) return 'text-amber-500';
  return 'text-zinc-500';
}

function tempBarColor(current: number): string {
  if (current >= 200) return 'bg-red-500';
  if (current >= 100) return 'bg-amber-500';
  return 'bg-zinc-600';
}

function speedLabel(level: number): string {
  switch (level) {
    case 1: return 'Silent';
    case 2: return 'Normal';
    case 3: return 'Sport';
    case 4: return 'Ludicrous';
    default: return `Level ${level}`;
  }
}

// ─── Tabs ───

type Tab = 'devices' | 'printers';

// ─── Component ───

export function LocalNetScreen() {
  const [tab, setTab] = useState<Tab>('devices');
  const client = useConnectionStore((s) => s.client);

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <Wifi size={20} className="text-amber-500" />
          <h1 className="text-lg font-semibold text-zinc-100">Local Network</h1>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('devices')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'devices'
                ? 'bg-amber-500/15 text-amber-500'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Radio size={14} />
              Devices
            </span>
          </button>
          <button
            onClick={() => setTab('printers')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'printers'
                ? 'bg-amber-500/15 text-amber-500'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Printer size={14} />
              Printers
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'devices' ? (
          <DevicesTab client={client} />
        ) : (
          <PrintersTab client={client} />
        )}
      </div>
    </div>
  );
}

// ─── Devices Tab ───

type DeviceFilter = 'all' | 'online' | 'offline';

interface DevicesTabProps {
  client: ReturnType<typeof useConnectionStore.getState>['client'];
}

function DevicesTab({ client }: DevicesTabProps) {
  const [devices, setDevices] = useState<LocalNetDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [deepScan, setDeepScan] = useState(false);
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [scanResult, setScanResult] = useState<LocalNetScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, { alive: boolean; latency_ms: number }>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [editLabels, setEditLabels] = useState('');
  const [editTags, setEditTags] = useState('');
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());

  const handleScan = useCallback(async () => {
    if (!client) return;
    setScanning(true);
    setError(null);
    try {
      const result = await client.scanNetwork(deepScan, 10);
      setScanResult(result);
      setDevices(result.devices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [client, deepScan]);

  const handlePing = useCallback(async (ip: string) => {
    if (!client) return;
    try {
      const result = await client.pingDevice(ip);
      setPingResults((prev) => ({ ...prev, [ip]: result }));
    } catch {
      setPingResults((prev) => ({ ...prev, [ip]: { alive: false, latency_ms: -1 } }));
    }
  }, [client]);

  const handleDelete = useCallback(async (ip: string) => {
    if (!client) return;
    try {
      await client.deleteDevice(ip);
      setDevices((prev) => prev.filter((d) => d.ip !== ip));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [client]);

  const handleSaveLabels = useCallback(async (ip: string) => {
    if (!client) return;
    const labels = editLabels.split(',').map((s) => s.trim()).filter(Boolean);
    const tags = editTags.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const updated = await client.updateDevice(ip, { labels, tags });
      setDevices((prev) => prev.map((d) => (d.ip === ip ? updated : d)));
      setEditingDevice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }, [client, editLabels, editTags]);

  const toggleExpand = useCallback((ip: string) => {
    setExpandedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  }, []);

  const filteredDevices = devices.filter((d) => {
    if (filter === 'online') return d.online;
    if (filter === 'offline') return !d.online;
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleScan}
          disabled={scanning || !client}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 text-sm font-medium transition-colors"
        >
          {scanning ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Search size={14} />
          )}
          {scanning ? 'Scanning...' : 'Scan Network'}
        </button>

        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deepScan}
            onChange={(e) => setDeepScan(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/30"
          />
          Deep Scan
        </label>

        <div className="flex gap-1 ml-auto">
          {(['all', 'online', 'offline'] as DeviceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                filter === f
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Scanning indicator */}
      {scanning && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-zinc-400">Scanning network{deepScan ? ' (deep mode)' : ''}...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Scan summary */}
      {scanResult && !scanning && (
        <p className="text-sm text-zinc-500">
          Found {scanResult.devices.length} devices ({scanResult.devices.filter((d) => d.online).length} online) in {scanResult.scan_duration_ms}ms
        </p>
      )}

      {/* Device grid */}
      {filteredDevices.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredDevices.map((device) => (
            <DeviceCard
              key={device.ip}
              device={device}
              pingResult={pingResults[device.ip]}
              expanded={expandedDevices.has(device.ip)}
              deleteConfirm={deleteConfirm === device.ip}
              editing={editingDevice === device.ip}
              editLabels={editLabels}
              editTags={editTags}
              onPing={() => handlePing(device.ip)}
              onDelete={() => handleDelete(device.ip)}
              onDeleteConfirm={() => setDeleteConfirm(device.ip)}
              onDeleteCancel={() => setDeleteConfirm(null)}
              onToggleExpand={() => toggleExpand(device.ip)}
              onEdit={() => {
                setEditingDevice(device.ip);
                setEditLabels(device.labels.join(', '));
                setEditTags(device.tags.join(', '));
              }}
              onEditLabelsChange={setEditLabels}
              onEditTagsChange={setEditTags}
              onEditSave={() => handleSaveLabels(device.ip)}
              onEditCancel={() => setEditingDevice(null)}
            />
          ))}
        </div>
      ) : !scanning ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <Wifi size={32} className="mb-3 text-zinc-600" />
          <p className="text-sm">No devices found. Run a network scan to discover devices.</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Device Card ───

interface DeviceCardProps {
  device: LocalNetDevice;
  pingResult?: { alive: boolean; latency_ms: number };
  expanded: boolean;
  deleteConfirm: boolean;
  editing: boolean;
  editLabels: string;
  editTags: string;
  onPing: () => void;
  onDelete: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onToggleExpand: () => void;
  onEdit: () => void;
  onEditLabelsChange: (v: string) => void;
  onEditTagsChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

function DeviceCard({
  device,
  pingResult,
  expanded,
  deleteConfirm,
  editing,
  editLabels,
  editTags,
  onPing,
  onDelete,
  onDeleteConfirm,
  onDeleteCancel,
  onToggleExpand,
  onEdit,
  onEditLabelsChange,
  onEditTagsChange,
  onEditSave,
  onEditCancel,
}: DeviceCardProps) {
  const displayName = device.labels[0] || device.hostname || device.ip;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Card body - clickable to expand */}
      <div className="px-4 py-3 cursor-pointer select-none" onClick={onToggleExpand}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${device.online ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{displayName}</p>
              {device.vendor && (
                <p className="text-xs text-zinc-500 truncate">{device.vendor}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 text-zinc-500">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </div>

        {/* Middle section */}
        <div className="mt-2 ml-4.5 space-y-1">
          <p className="text-xs text-zinc-400 font-mono">{device.ip}</p>
          <p className="text-xs text-zinc-500 font-mono">{formatMac(device.mac)}</p>

          {device.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {device.tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {device.ports.length > 0 && (
            <p className="text-[10px] text-zinc-600">
              Ports: {device.ports.slice(0, 8).join(', ')}{device.ports.length > 8 ? ` +${device.ports.length - 8}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Expanded: mDNS services */}
      {expanded && device.mdns_services.length > 0 && (
        <div className="mx-4 mb-2 ml-8 border-t border-zinc-800/60 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold mb-1">mDNS Services</p>
          <div className="space-y-1">
            {device.mdns_services.map((svc, i) => (
              <div key={i} className="text-xs text-zinc-400">
                <span className="font-medium text-zinc-300">{svc.name}</span>
                <span className="text-zinc-600"> · </span>
                <span className="font-mono text-zinc-500">{svc.type}</span>
                <span className="text-zinc-600"> · </span>
                <span className="font-mono">{svc.ip}:{svc.port}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline edit */}
      {editing && (
        <div className="mx-4 mb-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Labels (comma-separated)</label>
            <input
              type="text"
              value={editLabels}
              onChange={(e) => onEditLabelsChange(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50"
              placeholder="server, prod"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => onEditTagsChange(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50"
              placeholder="esp32, iot"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onEditSave(); }}
              className="flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
            >
              <Check size={12} /> Save
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEditCancel(); }}
              className="flex items-center gap-1 px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-medium transition-colors"
            >
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-zinc-800/60">
        {!deleteConfirm ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <Tag size={12} /> Label
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPing(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <Eye size={12} /> Ping
            </button>
            {pingResult && (
              <span className={`text-[10px] font-mono ${pingResult.alive ? 'text-emerald-400' : 'text-red-400'}`}>
                {pingResult.alive ? `${pingResult.latency_ms}ms` : 'timeout'}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteConfirm(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
            >
              <Trash2 size={12} /> Delete
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-red-400">Delete this device?</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-red-600 hover:bg-red-500 text-white transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteCancel(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Printers Tab ───

interface PrintersTabProps {
  client: ReturnType<typeof useConnectionStore.getState>['client'];
}

function PrintersTab({ client }: PrintersTabProps) {
  const [printers, setPrinters] = useState<BambuPrinterStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrinters = useCallback(async () => {
    if (!client) return;
    try {
      setLoading(true);
      const data = await client.getPrinters();
      setPrinters(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load printers');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchPrinters();
  }, [fetchPrinters]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    intervalRef.current = setInterval(fetchPrinters, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPrinters]);

  const handleAddPrinter = useCallback(async (config: BambuPrinterConfig) => {
    if (!client) return;
    try {
      await client.addPrinter(config);
      setShowAddModal(false);
      await fetchPrinters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add printer');
    }
  }, [client, fetchPrinters]);

  const handleDeletePrinter = useCallback(async (serial: string) => {
    if (!client) return;
    try {
      await client.deletePrinter(serial);
      setPrinters((prev) => prev.filter((p) => p.serial !== serial));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete printer');
    }
  }, [client]);

  const handleCommand = useCallback(async (serial: string, command: string) => {
    if (!client) return;
    try {
      await client.sendPrinterCommand(serial, command);
      // Refresh after command
      setTimeout(fetchPrinters, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Command "${command}" failed`);
    }
  }, [client, fetchPrinters]);

  const handleRefresh = useCallback(async (serial: string) => {
    if (!client) return;
    setRefreshing(serial);
    try {
      await client.refreshPrinter(serial);
      await fetchPrinters();
    } catch {
      // silent
    } finally {
      setRefreshing(null);
    }
  }, [client, fetchPrinters]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-medium transition-colors"
        >
          <Plus size={14} /> Add Printer
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Printer grid */}
      {loading && printers.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <RefreshCw size={20} className="animate-spin mr-2" />
          <span className="text-sm">Loading printers...</span>
        </div>
      ) : printers.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {printers.map((printer) => (
            <PrinterCard
              key={printer.serial}
              printer={printer}
              deleteConfirm={deleteConfirm === printer.serial}
              refreshing={refreshing === printer.serial}
              onCommand={(cmd) => handleCommand(printer.serial, cmd)}
              onRefresh={() => handleRefresh(printer.serial)}
              onDelete={() => handleDeletePrinter(printer.serial)}
              onDeleteConfirm={() => setDeleteConfirm(printer.serial)}
              onDeleteCancel={() => setDeleteConfirm(null)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <Printer size={32} className="mb-3 text-zinc-600" />
          <p className="text-sm">No printers configured. Add a Bambu Lab printer to get started.</p>
        </div>
      )}

      {/* Add Printer Modal */}
      {showAddModal && (
        <AddPrinterModal
          onSave={handleAddPrinter}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

// ─── Printer Card ───

interface PrinterCardProps {
  printer: BambuPrinterStatus;
  deleteConfirm: boolean;
  refreshing: boolean;
  onCommand: (cmd: string) => void;
  onRefresh: () => void;
  onDelete: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

function PrinterCard({
  printer,
  deleteConfirm,
  refreshing,
  onCommand,
  onRefresh,
  onDelete,
  onDeleteConfirm,
  onDeleteCancel,
}: PrinterCardProps) {
  const isPrinting = printer.gcode_state !== 'IDLE';
  const state = printer.gcode_state.toUpperCase();

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Printer size={18} className="text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-200">{printer.name || printer.model}</p>
            <p className="text-[10px] text-zinc-500 font-mono">{printer.model} · {printer.host}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
            isPrinting ? 'bg-amber-500/15 text-amber-500' : 'bg-zinc-800 text-zinc-500'
          }`}>
            {state}
          </span>
          <span className={`w-2 h-2 rounded-full ${printer.online ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
        </div>
      </div>

      {/* Print progress */}
      {isPrinting && (
        <div className="space-y-2">
          <div className="relative w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, printer.progress_percent))}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-zinc-200">
              {printer.progress_percent}%
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="truncate max-w-[60%]" title={printer.current_file}>
              {printer.current_file}
            </span>
            <span>{formatRemainingTime(printer.remaining_time_min)}</span>
          </div>
          {printer.total_layers > 0 && (
            <p className="text-[10px] text-zinc-500">
              Layer {printer.layer_num} / {printer.total_layers}
            </p>
          )}
        </div>
      )}

      {/* Temperature */}
      <div className="grid grid-cols-2 gap-3">
        <TempGauge label="Bed" current={printer.bed_temp} target={printer.bed_target} max={120} />
        <TempGauge label="Nozzle" current={printer.nozzle_temp} target={printer.nozzle_target} max={300} />
      </div>

      {/* Speed */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="text-zinc-500">Speed:</span>
        <span className="font-medium text-zinc-300">{speedLabel(printer.speed_level)}</span>
      </div>

      {/* AMS trays */}
      {printer.ams_trays.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold mb-2">AMS</p>
          <div className="grid grid-cols-4 gap-2">
            {printer.ams_trays.map((tray) => (
              <div key={tray.id} className="flex flex-col items-center gap-1 p-1.5 rounded-lg bg-zinc-800/50">
                <div
                  className="w-6 h-6 rounded-full border-2 border-zinc-700"
                  style={{ backgroundColor: tray.color }}
                  title={tray.color}
                />
                <span className="text-[10px] font-medium text-zinc-300">{tray.ctype}</span>
                <span className="text-[10px] text-zinc-500">{tray.remain_pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {state === 'RUNNING' && (
          <>
            <button
              onClick={() => onCommand('pause')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 text-xs font-medium transition-colors"
            >
              <Pause size={12} /> Pause
            </button>
            <button
              onClick={() => onCommand('stop')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium transition-colors"
            >
              <Square size={12} /> Stop
            </button>
          </>
        )}
        {state === 'PAUSED' && (
          <>
            <button
              onClick={() => onCommand('resume')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-medium transition-colors"
            >
              <Play size={12} /> Resume
            </button>
            <button
              onClick={() => onCommand('stop')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium transition-colors"
            >
              <Square size={12} /> Stop
            </button>
          </>
        )}
        {state === 'IDLE' && (
          <button
            disabled
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-600 text-xs font-medium cursor-not-allowed"
          >
            <Play size={12} /> Start
          </button>
        )}

        {printer.camera_url && (
          <a
            href={printer.camera_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
          >
            <Eye size={12} /> Camera
          </a>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>

          {!deleteConfirm ? (
            <button
              onClick={onDeleteConfirm}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                className="px-2 py-1 rounded text-[10px] bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
              >
                Delete
              </button>
              <button
                onClick={onDeleteCancel}
                className="px-2 py-1 rounded text-[10px] bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Temperature Gauge ───

function TempGauge({ label, current, target, max }: { label: string; current: number; target: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const colorClass = tempColor(current, target);
  const barColor = tempBarColor(current);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] text-zinc-500">
          <Thermometer size={10} /> {label}
        </span>
        <span className={`text-xs font-mono font-medium ${colorClass}`}>
          {current}°
          {target > 0 && <span className="text-zinc-600"> / {target}°</span>}
        </span>
      </div>
      <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Add Printer Modal ───

interface AddPrinterModalProps {
  onSave: (config: BambuPrinterConfig) => void;
  onClose: () => void;
}

function AddPrinterModal({ onSave, onClose }: AddPrinterModalProps) {
  const [serial, setSerial] = useState('');
  const [host, setHost] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [username, setUsername] = useState('');
  const [model, setModel] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!serial.trim() || !host.trim() || !accessCode.trim()) {
      setError('Serial, Host IP, and Access Code are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        serial: serial.trim(),
        host: host.trim(),
        access_code: accessCode.trim(),
        username: username.trim() || undefined,
        model: model.trim() || undefined,
        name: name.trim() || undefined,
      });
    } catch {
      setError('Failed to add printer.');
    } finally {
      setSaving(false);
    }
  }, [serial, host, accessCode, username, model, name, onSave]);

  const fields = [
    { label: 'Serial Number', value: serial, onChange: setSerial, placeholder: 'XXXXXXXXXXXX', required: true },
    { label: 'Host IP', value: host, onChange: setHost, placeholder: '192.168.1.100', required: true },
    { label: 'Access Code', value: accessCode, onChange: setAccessCode, placeholder: '12345678', required: true, type: 'password' },
    { label: 'Username (optional)', value: username, onChange: setUsername, placeholder: 'bblp' },
    { label: 'Model (optional)', value: model, onChange: setModel, placeholder: 'X1C, P1S, A1...' },
    { label: 'Name (optional)', value: name, onChange: setName, placeholder: 'My Printer' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Add Bambu Lab Printer</h2>
          <button onClick={onClose} className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {fields.map((field) => (
            <div key={field.label}>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
                {field.label}
              </label>
              <input
                type={field.type || 'text'}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 text-sm font-medium transition-colors"
          >
            {saving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
