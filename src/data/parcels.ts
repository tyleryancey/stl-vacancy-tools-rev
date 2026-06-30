// Centralized parcel/MPO data access. Loads the generated artifacts once and
// caches them so the map, search, list view, and MPO panel share one copy.
import { DATA_URL, META_URL, MPO_URL } from "@/config/constants";
import type { Parcel, DataMeta } from "@/types/parcel";

export type ParcelFeature = GeoJSON.Feature<GeoJSON.Point, Parcel>;
export type ParcelCollection = GeoJSON.FeatureCollection<GeoJSON.Point, Parcel>;

export interface MpoGroup {
  keys: number[];
  count: number;
  leadName: string;
}
export interface MpoData {
  mpos: string[];
  mpoGroups: Record<string, MpoGroup>;
}

let parcelsPromise: Promise<ParcelCollection> | null = null;
let parcelsCache: ParcelCollection | null = null;
let metaCache: DataMeta | null = null;
let mpoPromise: Promise<MpoData> | null = null;
let mpoCache: MpoData | null = null;

export function loadParcels(): Promise<ParcelCollection> {
  if (!parcelsPromise) {
    parcelsPromise = fetch(DATA_URL)
      .then((r) => r.json())
      .then((fc: ParcelCollection) => {
        parcelsCache = fc;
        return fc;
      });
  }
  return parcelsPromise;
}

export function getParcels(): ParcelFeature[] {
  return parcelsCache?.features ?? [];
}

export function loadMeta(): Promise<DataMeta> {
  if (metaCache) return Promise.resolve(metaCache);
  return fetch(META_URL)
    .then((r) => r.json())
    .then((m: DataMeta) => (metaCache = m));
}

export function loadMpo(): Promise<MpoData> {
  if (!mpoPromise) {
    mpoPromise = fetch(MPO_URL)
      .then((r) => r.json())
      .then((m: MpoData) => {
        mpoCache = m;
        return m;
      });
  }
  return mpoPromise;
}

export function getMpo(): MpoData | null {
  return mpoCache;
}

// --- MPO helpers (ported from the original getGroup/getAliases, §6.4) ---

export function getGroupCode(owner: string): string | null {
  const m = mpoCache;
  if (!m) return null;
  const idx = m.mpos.indexOf(owner);
  if (idx < 0) return null;
  for (const [code, g] of Object.entries(m.mpoGroups)) {
    if (g.keys.includes(idx)) return code;
  }
  return null;
}

// All name variants (aliases) of an owner's group, including the owner itself.
export function getAliases(owner: string): string[] {
  const m = mpoCache;
  if (!m) return [owner];
  const code = getGroupCode(owner);
  if (!code) return [owner];
  return m.mpoGroups[code].keys.map((k) => m.mpos[k]);
}

export function getLeadName(owner: string): string {
  const m = mpoCache;
  if (!m) return owner;
  const code = getGroupCode(owner);
  return code ? m.mpoGroups[code].leadName : owner;
}
