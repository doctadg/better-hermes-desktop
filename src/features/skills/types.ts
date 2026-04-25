/**
 * Skills feature — local types.
 *
 * Kept in the feature folder (not src/api/types.ts) because the central API
 * type `SkillInfo` is a flat record with only {name, description, category,
 * enabled}, while this feature combines fathah's installed/bundled split
 * with dodo's hash-based content model.
 *
 * If the Hermes server later ships a richer skill payload, prefer migrating
 * these into src/api/types.ts and re-exporting; the renderer should remain
 * the single source of truth for UI-only fields (badges, tab membership).
 */

import type { SkillInfo } from '@/api/types';

/** Where a skill lives. Used to decide write-permission and pick endpoints. */
export type SkillSourceKind = 'installed' | 'bundled';

/**
 * UI-shaped skill summary. Adapts the lean server `SkillInfo` and adds
 * the optional badge/version fields surfaced by dodo's richer payload.
 *
 * `id` is the stable identifier we hand to the API — currently the same
 * as `name`, but kept distinct so a future server change to slug-based
 * IDs doesn't ripple through every component.
 */
export interface SkillItem {
  /** Stable identifier passed to install/uninstall/loadDetail. */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description. */
  description: string;
  /** Coarse grouping (Memory/Code/Web/…). Null when unknown. */
  category: string | null;
  /** Optional semver-ish string. */
  version: string | null;
  /** Whether this skill is currently enabled / installed. */
  installed: boolean;
  /** Origin tab membership. */
  source: SkillSourceKind;
  /** Whether the skill ships a `references/` directory. */
  has_references: boolean;
  /** Whether the skill ships a `scripts/` directory. */
  has_scripts: boolean;
  /** Whether the skill ships a `templates/` directory. */
  has_templates: boolean;
}

/** Result of loading the editable SKILL.md body for a skill. */
export interface SkillDetail {
  /** Raw markdown content. Empty string when missing. */
  content: string;
  /** Lowercase hex sha256 of `content` at fetch time. */
  contentHash: string;
  /** False when the server reported no SKILL.md was found. */
  exists: boolean;
  /** Epoch ms when the renderer fetched this content. */
  loadedAt: number;
}

/** Both tabs in one payload — mirrors fathah's `loadAll` ergonomics. */
export interface SkillsResponseShape {
  installed: SkillItem[];
  bundled: SkillItem[];
}

/**
 * Adapt the flat server `SkillInfo[]` into the installed/bundled split.
 *
 * The current Hermes server doesn't distinguish bundled-but-not-installed
 * skills; everything in `getSkills()` is treated as installed. Bundled is
 * left empty until a server endpoint exists. Documented in INTEGRATION.md.
 */
export function adaptSkillInfoList(list: SkillInfo[]): SkillsResponseShape {
  const items: SkillItem[] = list.map((s) => ({
    id: s.name,
    name: s.name,
    description: s.description,
    category: s.category,
    version: null,
    installed: s.enabled,
    source: 'installed',
    has_references: false,
    has_scripts: false,
    has_templates: false,
  }));
  return {
    installed: items,
    bundled: [],
  };
}

/**
 * Thrown by `useSkills().save()` when the on-disk content hash drifts away
 * from the hash recorded when the user opened the editor. The renderer
 * shows a `ConflictDialog` and prompts to reload.
 */
export class ConflictError extends Error {
  /** Hash the renderer expected (what was loaded into the editor). */
  readonly expectedHash: string;
  /** Hash the server reports right now. */
  readonly actualHash: string;
  /** Latest content from the server, ready to overwrite the editor. */
  readonly latestContent: string;

  constructor(opts: { expectedHash: string; actualHash: string; latestContent: string }) {
    super(
      `Skill content changed on the server (expected ${opts.expectedHash.slice(0, 8)}…, got ${opts.actualHash.slice(0, 8)}…). Reload before saving.`
    );
    this.name = 'ConflictError';
    this.expectedHash = opts.expectedHash;
    this.actualHash = opts.actualHash;
    this.latestContent = opts.latestContent;
  }
}
