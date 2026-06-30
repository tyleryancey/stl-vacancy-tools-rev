// Client-side search over our own data (the original used the Mapbox geocoder +
// an owner-name scan, §10.2). The public CSV has every address + lat/lng, so we
// resolve addresses, owners, and neighborhoods without any external geocoder.
import { getParcels, getMpo, type ParcelFeature } from "@/data/parcels";

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function searchAddresses(query: string, limit = 8): ParcelFeature[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const feats = getParcels();
  const starts: ParcelFeature[] = [];
  const contains: ParcelFeature[] = [];
  for (const f of feats) {
    const a = norm(f.properties.Address);
    if (!a) continue;
    if (a.startsWith(q)) starts.push(f);
    else if (a.includes(q)) contains.push(f);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export interface OwnerMatch {
  name: string;
  count: number;
}

export function searchOwners(query: string, limit = 8): OwnerMatch[] {
  const q = norm(query);
  if (q.length < 3) return [];
  const mpo = getMpo();
  if (!mpo) return [];
  const out: OwnerMatch[] = [];
  for (let i = 0; i < mpo.mpos.length; i++) {
    if (norm(mpo.mpos[i]).includes(q)) {
      out.push({ name: mpo.mpos[i], count: ownerParcelCount(mpo.mpos[i]) });
      if (out.length >= limit * 3) break;
    }
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit);
}

function ownerParcelCount(owner: string): number {
  let n = 0;
  for (const f of getParcels()) if (f.properties.OwnerName === owner) n++;
  return n;
}

export function searchNeighborhoods(query: string, limit = 6): string[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const set = new Set<string>();
  for (const f of getParcels()) {
    const n = f.properties.NhdName;
    if (n && norm(n).includes(q)) set.add(n);
    if (set.size >= limit * 2) break;
  }
  return [...set].slice(0, limit);
}
