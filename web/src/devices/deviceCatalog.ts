import type { DeviceProviderKind, DiffuserDevice, DiscoverableDevice } from '../types/device';

export const providerLabels: Record<DeviceProviderKind, string> = {
  moodo: 'Moodo',
  govee: 'Govee',
  switchbot: 'SwitchBot',
  homeAssistant: 'Home Assistant',
  homeKit: 'Apple Home',
};

/** A couple of devices already "paired" so the Devices tab isn't empty on
 * first load — mirrors what a returning user would see. */
export const seedDevices: DiffuserDevice[] = [
  {
    id: 'seed-living-room',
    name: 'Living Room',
    room: 'Living Room',
    provider: 'moodo',
    mode: 'auto',
    isOnline: true,
    battery: 68,
    isPluggedIn: true,
    lastSeen: Date.now(),
  },
  {
    id: 'seed-bedroom',
    name: 'Bedroom',
    room: 'Bedroom',
    provider: 'govee',
    mode: 'auto',
    isOnline: true,
    battery: 22,
    isPluggedIn: false,
    lastSeen: Date.now(),
  },
];

/** Mock "nearby devices" a scan turns up — spans every supported provider
 * so the connect flow demonstrates the full provider lineup. */
export const discoverableCatalog: DiscoverableDevice[] = [
  { id: 'disc-office', name: 'Office Diffuser', room: 'Office', provider: 'switchbot', battery: 91, isPluggedIn: false },
  { id: 'disc-studio', name: 'Studio', room: 'Studio', provider: 'homeKit', battery: null, isPluggedIn: true },
  { id: 'disc-hallway', name: 'Hallway Plug', room: 'Hallway', provider: 'homeAssistant', battery: null, isPluggedIn: true },
  { id: 'disc-guest', name: 'Guest Room', room: 'Guest Room', provider: 'moodo', battery: 54, isPluggedIn: false },
];
