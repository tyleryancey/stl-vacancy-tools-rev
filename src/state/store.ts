import { create } from "zustand";
import type { Map as MlMap } from "maplibre-gl";
import type { Brand } from "@/config/constants";
import type { Parcel, VacDesc } from "@/types/parcel";
import { getProvider, LSEM_ROLES, type User, type CaseRecord } from "@/services";

// Modern equivalent of the original `window.stlv` global (REVERSE-ENGINEERING.md §3.1).

export type Ownership = "all" | "lra" | "private";
export type OwnerLoc = "all" | "city" | "mo" | "outofstate";
export type ViewMode = "map" | "list" | "stats" | "cases";

// Filters adapted to the public-CSV schema (the original's VacBegin onset slider,
// PropNS, and poverty-zone fields are not in the public export — see README).
export interface Filters {
  showBuildings: boolean;
  showLots: boolean;
  ownership: Ownership;
  ownerLoc: OwnerLoc;
  minTaxYrsDel: number; // 0 = any
  condemnedOnly: boolean;
  boardedOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  showBuildings: true,
  showLots: true,
  ownership: "all",
  ownerLoc: "all",
  minTaxYrsDel: 0,
  condemnedOnly: false,
  boardedOnly: false,
};

export const ALL_VAC_DESC: VacDesc[] = [
  "Definite",
  "Very Likely",
  "Possible",
  "Indeterminant",
];

export interface ListQuery {
  type: "neighborhood" | "ward" | "condemned";
  value: string;
}

interface AppState {
  brand: Brand;
  setBrand: (b: Brand) => void;

  map: MlMap | null;
  setMap: (m: MlMap | null) => void;

  selectedParcel: Parcel | null;
  selectParcel: (p: Parcel | null) => void;

  dataReady: boolean;
  setDataReady: (v: boolean) => void;

  // filters
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  resetFilters: () => void;
  certaintyVisible: Record<VacDesc, boolean>;
  toggleCertainty: (d: VacDesc) => void;

  // overlays
  overlayCondemned: boolean;
  toggleOverlayCondemned: () => void;

  // neighborhood highlight
  highlightedNeighborhood: string | null;
  setHighlightedNeighborhood: (n: string | null) => void;

  // MPO panel: the owner whose portfolio is being shown
  mpoOwner: string | null;
  openMpoPanel: (owner: string | null) => void;

  // views
  view: ViewMode;
  setView: (v: ViewMode) => void;
  listQuery: ListQuery | null;
  setListQuery: (q: ListQuery | null) => void;

  // auth + LSEM case tier
  user: User | null;
  authError: string | null;
  loginOpen: boolean;
  setLoginOpen: (v: boolean) => void;
  cases: CaseRecord[];
  lookupCaseByHandle: Record<string, string>;
  selectedCaseId: string | null;
  initAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectCase: (caseId: string | null) => void;
}

function indexCases(cases: CaseRecord[]): Record<string, string> {
  const idx: Record<string, string> = {};
  for (const c of cases) idx[c.handle] = c.caseId;
  return idx;
}

export const useStore = create<AppState>((set) => ({
  brand: "public",
  setBrand: (brand) => set({ brand }),

  map: null,
  setMap: (map) => set({ map }),

  selectedParcel: null,
  selectParcel: (selectedParcel) => set({ selectedParcel }),

  dataReady: false,
  setDataReady: (dataReady) => set({ dataReady }),

  filters: { ...DEFAULT_FILTERS },
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  certaintyVisible: {
    Definite: true,
    "Very Likely": true,
    Possible: true,
    Indeterminant: true,
    "Not Vacant": false,
  },
  toggleCertainty: (d) =>
    set((s) => ({
      certaintyVisible: { ...s.certaintyVisible, [d]: !s.certaintyVisible[d] },
    })),

  overlayCondemned: false,
  toggleOverlayCondemned: () =>
    set((s) => ({ overlayCondemned: !s.overlayCondemned })),

  highlightedNeighborhood: null,
  setHighlightedNeighborhood: (highlightedNeighborhood) =>
    set({ highlightedNeighborhood }),

  mpoOwner: null,
  openMpoPanel: (mpoOwner) => set({ mpoOwner }),

  view: "map",
  setView: (view) => set({ view }),
  listQuery: null,
  setListQuery: (listQuery) => set({ listQuery }),

  user: null,
  authError: null,
  loginOpen: false,
  setLoginOpen: (loginOpen) => set({ loginOpen }),
  cases: [],
  lookupCaseByHandle: {},
  selectedCaseId: null,

  initAuth: async () => {
    const provider = getProvider();
    const user = provider.currentUser();
    if (!user) return;
    const isLsem = LSEM_ROLES.includes(user.role);
    const cases = isLsem ? await provider.getCasesForUser(user) : [];
    set({
      user,
      brand: isLsem ? "lsem" : "public",
      cases,
      lookupCaseByHandle: indexCases(cases),
    });
  },

  login: async (email, password) => {
    set({ authError: null });
    try {
      const provider = getProvider();
      const user = await provider.signIn(email, password);
      const isLsem = LSEM_ROLES.includes(user.role);
      const cases = isLsem ? await provider.getCasesForUser(user) : [];
      set({
        user,
        brand: isLsem ? "lsem" : "public",
        cases,
        lookupCaseByHandle: indexCases(cases),
        loginOpen: false,
      });
    } catch (e) {
      set({ authError: e instanceof Error ? e.message : "Sign-in failed" });
    }
  },

  logout: async () => {
    await getProvider().signOut();
    set({
      user: null,
      brand: "public",
      cases: [],
      lookupCaseByHandle: {},
      selectedCaseId: null,
      view: "map",
    });
  },

  selectCase: (selectedCaseId) => set({ selectedCaseId }),
}));
