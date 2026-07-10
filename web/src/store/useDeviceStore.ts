import { create } from 'zustand';
import { discoverableCatalog, seedDevices } from '../devices/deviceCatalog';
import type { DeviceMode, DiffuserDevice, DiscoverableDevice } from '../types/device';

type ScanState = 'idle' | 'scanning' | 'results';

const SCAN_DURATION_MS = 1600;
const CONNECT_DURATION_MS = 1100;
const BATTERY_DRAIN_INTERVAL_MS = 25000;

interface DeviceState {
  devices: DiffuserDevice[];
  scanState: ScanState;
  discovered: DiscoverableDevice[];
  connectingId: string | null;

  startScan: () => Promise<void>;
  connectDevice: (candidateId: string) => Promise<void>;
  removeDevice: (id: string) => void;
  setMode: (id: string, mode: DeviceMode) => void;
  closeScan: () => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: seedDevices,
  scanState: 'idle',
  discovered: [],
  connectingId: null,

  startScan: async () => {
    set({ scanState: 'scanning', discovered: [] });
    await new Promise((resolve) => setTimeout(resolve, SCAN_DURATION_MS));

    const connectedIds = new Set(get().devices.map((d) => d.id));
    const candidates = discoverableCatalog.filter((c) => !connectedIds.has(c.id));
    set({ scanState: 'results', discovered: candidates });
  },

  connectDevice: async (candidateId: string) => {
    const candidate = get().discovered.find((c) => c.id === candidateId);
    if (!candidate) return;

    set({ connectingId: candidateId });
    await new Promise((resolve) => setTimeout(resolve, CONNECT_DURATION_MS));

    const newDevice: DiffuserDevice = {
      id: candidate.id,
      name: candidate.name,
      room: candidate.room,
      provider: candidate.provider,
      mode: 'auto',
      isOnline: true,
      battery: candidate.battery,
      isPluggedIn: candidate.isPluggedIn,
      lastSeen: Date.now(),
    };

    set((state) => ({
      devices: [...state.devices, newDevice],
      discovered: state.discovered.filter((c) => c.id !== candidateId),
      connectingId: null,
    }));
  },

  removeDevice: (id: string) => {
    set((state) => ({ devices: state.devices.filter((d) => d.id !== id) }));
  },

  setMode: (id: string, mode: DeviceMode) => {
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, mode } : d)),
    }));
  },

  closeScan: () => set({ scanState: 'idle', discovered: [] }),
}));

// Gently drains battery on unplugged devices so the Devices tab feels alive
// over a longer demo session, without needing a real device to poll.
setInterval(() => {
  useDeviceStore.setState((state) => ({
    devices: state.devices.map((d) =>
      d.battery !== null && !d.isPluggedIn && d.battery > 0 ? { ...d, battery: d.battery - 1 } : d,
    ),
  }));
}, BATTERY_DRAIN_INTERVAL_MS);
