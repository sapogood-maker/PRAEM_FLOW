import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─── Rich queue item used across queue & dispatch pages ───────────────────────

export interface DispatchQueueItem {
  id: string;
  patientId: string;
  priority: string;
  status: string;
  destination: string | null;
  healthcareLocationId: string | null;
  appointmentDate: string;
  confirmationStatus?: string | null;
  notes?: string | null;
  patient: { id: string; name: string; mobility: string; clinicalRisk: string };
  healthcareLocation?: {
    id: string;
    name: string;
    city?: string;
    type?: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
}

// ─── Route draft — persisted configuration before the actual dispatch ─────────

export interface RouteDraft {
  driverId: string;
  vehicleId: string;
  locationId: string;
  origin: string;
  dispatchType: 'IMMEDIATE' | 'SCHEDULED';
  scheduledDate: string;
  scheduledTime: string;
}

const DEFAULT_ROUTE_DRAFT: RouteDraft = {
  driverId: '',
  vehicleId: '',
  locationId: '',
  origin: 'Prefeitura Municipal',
  dispatchType: 'IMMEDIATE',
  scheduledDate: '',
  scheduledTime: '08:00',
};

// ─── Operational filters ──────────────────────────────────────────────────────

export interface OperationalFilters {
  search: string;
  priority: string;
  confirmationStatus: string;
  returnOnly: boolean;
}

const DEFAULT_FILTERS: OperationalFilters = {
  search: '',
  priority: '',
  confirmationStatus: '',
  returnOnly: false,
};

// ─── Store ────────────────────────────────────────────────────────────────────

interface OperationalDispatchState {
  /** Queue items staged for dispatch — source of truth for selectedPatients */
  pendingDispatch: DispatchQueueItem[];
  /** IDs of active (in-progress) routes */
  activeRouteIds: string[];
  /** IDs of scheduled routes */
  scheduledRouteIds: string[];
  /** Route configuration draft — persisted across page refreshes */
  currentRouteDraft: RouteDraft;
  /** Operational filters for the dispatch staging area */
  operationalFilters: OperationalFilters;

  // ── Derived (not stored) ────────────────────────────────────────────────────
  /** All pendingDispatch IDs — derived, no separate state */
  readonly selectedPatients: string[];

  // ── Actions ─────────────────────────────────────────────────────────────────
  addToDispatch: (item: DispatchQueueItem) => void;
  removeFromDispatch: (queueId: string) => void;
  clearDispatch: () => void;
  setActiveRouteIds: (ids: string[]) => void;
  setScheduledRouteIds: (ids: string[]) => void;
  updateRouteDraft: (partial: Partial<RouteDraft>) => void;
  clearRouteDraft: () => void;
  updateFilters: (partial: Partial<OperationalFilters>) => void;

  // ── Legacy compat ────────────────────────────────────────────────────────────
  toggleSelectedPatient: (queueId: string) => void;
  setSelectedPatients: (ids: string[]) => void;
  clearSelectedPatients: () => void;
}

export const useOperationalDispatchStore = create<OperationalDispatchState>()(
  persist(
    (set, get) => ({
      pendingDispatch: [],
      activeRouteIds: [],
      scheduledRouteIds: [],
      currentRouteDraft: DEFAULT_ROUTE_DRAFT,
      operationalFilters: DEFAULT_FILTERS,

      // Derived — always in sync with pendingDispatch
      get selectedPatients() {
        return get().pendingDispatch.map((p) => p.id);
      },

      addToDispatch: (item) =>
        set((s) => {
          if (s.pendingDispatch.some((p) => p.id === item.id)) return s;
          return { pendingDispatch: [...s.pendingDispatch, item] };
        }),

      removeFromDispatch: (queueId) =>
        set((s) => ({
          pendingDispatch: s.pendingDispatch.filter((p) => p.id !== queueId),
        })),

      clearDispatch: () => set({ pendingDispatch: [] }),

      setActiveRouteIds: (ids) => set({ activeRouteIds: ids }),
      setScheduledRouteIds: (ids) => set({ scheduledRouteIds: ids }),

      updateRouteDraft: (partial) =>
        set((s) => ({
          currentRouteDraft: { ...s.currentRouteDraft, ...partial },
        })),

      clearRouteDraft: () => set({ currentRouteDraft: DEFAULT_ROUTE_DRAFT }),

      updateFilters: (partial) =>
        set((s) => ({
          operationalFilters: { ...s.operationalFilters, ...partial },
        })),

      // ── Legacy compat ──────────────────────────────────────────────────────
      /** Toggle is now a no-op alias for removeFromDispatch (item is already in pendingDispatch) */
      toggleSelectedPatient: (queueId) => {
        const { pendingDispatch, removeFromDispatch } = get();
        if (pendingDispatch.some((p) => p.id === queueId)) {
          removeFromDispatch(queueId);
        }
      },
      setSelectedPatients: (_ids) => {
        // no-op: selectedPatients is derived from pendingDispatch
      },
      clearSelectedPatients: () => set({ pendingDispatch: [] }),
    }),
    {
      name: 'praem-operational-dispatch',
      storage: createJSONStorage(() => {
        // Use sessionStorage as fallback during SSR
        if (typeof window === 'undefined') return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        return sessionStorage;
      }),
      partialize: (state) => ({
        pendingDispatch: state.pendingDispatch,
        currentRouteDraft: state.currentRouteDraft,
        operationalFilters: state.operationalFilters,
      }),
    },
  ),
);
