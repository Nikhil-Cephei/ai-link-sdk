/**
 * bleStore — persisted BLE connection state.
 *
 * Uses Zustand with an MMKV-backed persist middleware to survive app restarts.
 * Only the last-connected device identity is persisted; all session state is
 * in-memory and resets on every app launch.
 *
 * Peer dependencies required: zustand, react-native-mmkv
 */
import { createMMKV } from "react-native-mmkv";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// ── MMKV storage adapter ──────────────────────────────────────────────────────

const mmkv = createMMKV({ id: "ai-link-ble-store" });

const mmkvStorage = createJSONStorage(() => ({
  getItem: (name: string) => mmkv.getString(name) ?? null,
  setItem: (name: string, value: string) => mmkv.set(name, value),
  removeItem: (name: string) => mmkv.remove(name),
}));

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectState = "disconnected" | "connecting" | "connected";

export interface SupportedUnits {
  weight: number[];
  height: number[];
}

interface BleStore {
  // ── Persisted across sessions ──────────────────────────────────────────────
  lastConnectedMac: string | null;
  lastConnectedName: string | null;

  // ── Session state (in-memory, resets on app kill) ─────────────────────────
  connectState: ConnectState;
  connectedMac: string | null;
  connectedName: string | null;
  bleVersion: string | null;
  bleName: string | null;
  supportedUnits: SupportedUnits | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  setConnecting: (mac: string) => void;
  setConnected: (mac: string, name: string) => void;
  setDisconnected: () => void;
  setBleVersion: (version: string) => void;
  setBleDeviceName: (name: string) => void;
  setSupportedUnits: (units: SupportedUnits) => void;
  clearLastConnected: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useBleStore = create<BleStore>()(
  persist(
    (set) => ({
      lastConnectedMac: null,
      lastConnectedName: null,

      connectState: "disconnected",
      connectedMac: null,
      connectedName: null,
      bleVersion: null,
      bleName: null,
      supportedUnits: null,

      setConnecting: (mac) =>
        set({ connectState: "connecting", connectedMac: mac }),

      setConnected: (mac, name) =>
        set({
          connectState: "connected",
          connectedMac: mac,
          connectedName: name,
          // Persist so auto-reconnect works next session.
          lastConnectedMac: mac,
          lastConnectedName: name || null,
        }),

      setDisconnected: () =>
        set({
          connectState: "disconnected",
          connectedMac: null,
          connectedName: null,
          bleVersion: null,
          bleName: null,
          supportedUnits: null,
        }),

      setBleVersion: (version) => set({ bleVersion: version }),
      setBleDeviceName: (name) => set({ bleName: name }),
      setSupportedUnits: (units) => set({ supportedUnits: units }),
      clearLastConnected: () =>
        set({ lastConnectedMac: null, lastConnectedName: null }),
    }),
    {
      name: "ai-link-ble-store",
      storage: mmkvStorage,
      // Only the last-connected identity is worth persisting.
      partialize: (state) => ({
        lastConnectedMac: state.lastConnectedMac,
        lastConnectedName: state.lastConnectedName,
      }),
    },
  ),
);
