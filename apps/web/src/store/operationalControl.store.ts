import { create } from 'zustand';

export type OperationalFocusScope = 'queue' | 'route' | 'vehicle' | 'operation';

export type OperationalFocus = {
  scope: OperationalFocusScope;
  queueIds: string[];
  routeId?: string | null;
  vehicleId?: string | null;
  operationId?: string | null;
  center?: { lat: number; lng: number };
  zoom?: number;
  label?: string;
  status?: string;
  updatedAt: string;
};

type SetFocusInput = Omit<OperationalFocus, 'updatedAt'>;

type OperationalControlState = {
  focus: OperationalFocus | null;
  setFocus: (focus: SetFocusInput) => void;
  clearFocus: () => void;
};

export const useOperationalControlStore = create<OperationalControlState>((set) => ({
  focus: null,
  setFocus: (focus) =>
    set({
      focus: {
        ...focus,
        updatedAt: new Date().toISOString(),
      },
    }),
  clearFocus: () => set({ focus: null }),
}));
