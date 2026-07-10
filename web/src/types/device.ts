/** Mirrors the provider vocabulary from the native MoodSyncCore diffuser
 * layer, kept as a closed union so the UI can render provider-specific
 * icons/labels without a fallthrough case. */
export type DeviceProviderKind = 'moodo' | 'govee' | 'switchbot' | 'homeAssistant' | 'homeKit';

/** Whether MoodSync is allowed to change this device automatically when the
 * wellness engine updates, or whether the user has taken manual control. */
export type DeviceMode = 'auto' | 'manual';

export interface DiffuserDevice {
  id: string;
  name: string;
  room: string;
  provider: DeviceProviderKind;
  mode: DeviceMode;
  isOnline: boolean;
  /** 0-100, or null for devices with no battery (e.g. always-plugged-in). */
  battery: number | null;
  isPluggedIn: boolean;
  lastSeen: number;
}

export interface DiscoverableDevice {
  id: string;
  name: string;
  room: string;
  provider: DeviceProviderKind;
  battery: number | null;
  isPluggedIn: boolean;
}
