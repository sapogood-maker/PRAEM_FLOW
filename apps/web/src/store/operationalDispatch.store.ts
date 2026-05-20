import { create } from 'zustand';

// ─── Rich queue item used across queue & dispatch pages ───────────────────────

export interface DispatchQueueItem {
  id: string;
  patientId: string;
  priority: string;
  status: string;
  destination: string | null;
  healthcareLocationId: string | null;
  appointmentDate: string;
  notes?: string | null;
  patient: { id: string; name: string; mobility: string; clinicalRisk: string };
  healthcareLocation?: { id: string; name: string; latitude: number | null; longitude: number | null } | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface OperationalDispatchState {
  /** Queue items manually moved to the dispatch staging area */
  pendingDispatch: DispatchQueueItem[];
  /** IDs of queue items selected in the dispatch form */
  selectedPatients: string[];
  /** IDs of active (in-progress) routes — populated by the Kanban/central page */
  activeRouteIds: string[];
  /** IDs of scheduled routes */
  scheduledRouteIds: string[];

  // Actions
  addToDispatch: (item: DispatchQueueItem) => void;
  removeFromDispatch: (queueId: string) => void;
  clearDispatch: () => void;
  toggleSelectedPatient: (queueId: string) => void;
  setSelectedPatients: (ids: string[]) => void;
  clearSelectedPatients: () => void;
  setActiveRouteIds: (ids: string[]) => void;
  setScheduledRouteIds: (ids: string[]) => void;
}

export const useOperationalDispatchStore = create<OperationalDispatchState>((set) => ({
  pendingDispatch: [],
  selectedPatients: [],
  activeRouteIds: [],
  scheduledRouteIds: [],

  addToDispatch: (item) =>
    set((s) => {
      if (s.pendingDispatch.some((p) => p.id === item.id)) return s;
      return {
        pendingDispatch: [...s.pendingDispatch, item],
        selectedPatients: [...s.selectedPatients, item.id],
      };
    }),

  removeFromDispatch: (queueId) =>
    set((s) => ({
      pendingDispatch: s.pendingDispatch.filter((p) => p.id !== queueId),
      selectedPatients: s.selectedPatients.filter((id) => id !== queueId),
    })),

  clearDispatch: () => set({ pendingDispatch: [], selectedPatients: [] }),

  toggleSelectedPatient: (queueId) =>
    set((s) => ({
      selectedPatients: s.selectedPatients.includes(queueId)
        ? s.selectedPatients.filter((id) => id !== queueId)
        : [...s.selectedPatients, queueId],
    })),

  setSelectedPatients: (ids) => set({ selectedPatients: ids }),
  clearSelectedPatients: () => set({ selectedPatients: [] }),

  setActiveRouteIds: (ids) => set({ activeRouteIds: ids }),
  setScheduledRouteIds: (ids) => set({ scheduledRouteIds: ids }),
}));
