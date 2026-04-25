import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { SkillInfo } from '@/api/types';

export function SkillsScreen() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const getClient = useConnectionStore((s) => s.getClient);

  const fetchSkills = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.getSkills();
      setSkills(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // Search debounce
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const handleToggle = useCallback(async (skill: SkillInfo) => {
    const client = getClient();
    if (!client) return;
    setToggling(skill.name);
    try {
      await client.toggleSkill(skill.name, !skill.enabled);
      await fetchSkills();
      // Update selected skill if it's the one we toggled
      if (selectedSkill?.name === skill.name) {
        setSelectedSkill((prev) => prev ? { ...prev, enabled: !prev.enabled } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle skill');
    } finally {
      setToggling(null);
    }
  }, [getClient, fetchSkills, selectedSkill]);

  // Derive categories
  const categories = Array.from(
    new Set(skills.map((s) => s.category).filter(Boolean) as string[])
  ).sort();

  const enabledCount = skills.filter((s) => s.enabled).length;
  const disabledCount = skills.length - enabledCount;

  const filtered = skills.filter((s) => {
    const matchesSearch =
      !debouncedSearch ||
      s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesCategory = !selectedCategory || s.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading skills...
      </div>
    );
  }

  return (
    <div className="h-full flex bg-zinc-950 animate-fade-in">
      {/* Main content */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${selectedSkill ? 'mr-[400px]' : ''}`}>
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-800 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-zinc-200">Skills</h2>
              <span className="text-xs text-zinc-600">{skills.length} total, {enabledCount} enabled</span>
            </div>
            <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
              {(['all', 'enabled', 'disabled'] as const).map((filter) => {
                const count = filter === 'all' ? skills.length : filter === 'enabled' ? enabledCount : disabledCount;
                return (
                  <button
                    key={filter}
                    onClick={() => setSelectedCategory(null)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 ${
                      !selectedCategory
                        ? 'bg-zinc-800 text-amber-400 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter === 'enabled' ? 'On' : 'Off'} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3.5 3.5" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 focus:border-amber-500 outline-none"
              placeholder="Search skills..."
            />
          </div>

          {/* Category pills */}
          {categories.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors duration-150 ${
                  !selectedCategory
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors duration-150 ${
                    selectedCategory === cat
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-300">x</button>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              {debouncedSearch || selectedCategory ? 'No skills match your filter.' : 'No skills available.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((skill) => (
                <button
                  key={skill.name}
                  onClick={() => setSelectedSkill(skill)}
                  className={`text-left p-3 bg-zinc-900 border rounded-xl transition-colors duration-150 hover:border-zinc-700 ${
                    selectedSkill?.name === skill.name
                      ? 'border-amber-500/50'
                      : 'border-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-medium text-zinc-200 truncate">{skill.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] shrink-0 ${
                      skill.enabled
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}>
                      {skill.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 line-clamp-2">{skill.description}</p>
                  {skill.category && (
                    <span className="text-[10px] text-zinc-600 mt-1 block">{skill.category}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slide-out detail panel */}
      {selectedSkill && (
        <div className="fixed right-0 top-0 bottom-0 w-[400px] bg-zinc-950 border-l border-zinc-800 flex flex-col animate-fade-in z-10">
          <div className="shrink-0 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200 truncate">{selectedSkill.name}</h3>
            <button
              onClick={() => setSelectedSkill(null)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
            {selectedSkill.category && (
              <span className="px-2 py-0.5 text-[11px] bg-zinc-800 text-zinc-400 rounded-full border border-zinc-700">
                {selectedSkill.category}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              selectedSkill.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {selectedSkill.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs text-zinc-300 leading-relaxed">{selectedSkill.description}</p>
          </div>

          <div className="shrink-0 border-t border-zinc-800 p-4">
            <button
              onClick={() => handleToggle(selectedSkill)}
              disabled={toggling !== null}
              className={`w-full py-2 text-xs font-medium rounded-lg transition-colors duration-150 disabled:opacity-40 ${
                selectedSkill.enabled
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                  : 'bg-amber-500 hover:bg-amber-600 text-zinc-950'
              }`}
            >
              {toggling === selectedSkill.name
                ? 'Toggling...'
                : selectedSkill.enabled
                  ? 'Disable'
                  : 'Enable'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
