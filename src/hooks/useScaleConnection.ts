/**
 * useScaleConnection — connection lifecycle.
 *
 * Provides reactive connection state and connect/disconnect actions.
 * Pass a MAC address from useScaleScan to connect().
 *
 * Must be used inside <ScaleProvider>.
 *
 * @example
 * const { connect, disconnect, isConnected, connectedName } = useScaleConnection();
 * // After scan:
 * connect(device.mac);
 */
import { useScaleContext, type ScalePhase } from './ScaleContext';

export interface ScaleConnection {
  /** Granular lifecycle phase. */
  phase: ScalePhase;
  /** True when phase is connected | measuring | done. */
  isConnected: boolean;
  /** True while a connection attempt is in progress. */
  isConnecting: boolean;
  /** MAC address of the currently connected device, or null. */
  connectedMac: string | null;
  /** Broadcast name of the connected device, or null. */
  connectedName: string | null;
  /** Initiate a connection to the given MAC address. */
  connect: (mac: string) => void;
  /** Disconnect the current device. */
  disconnect: () => void;
}

export function useScaleConnection(): ScaleConnection {
  const { phase, connectedMac, connectedName, connect, disconnect } =
    useScaleContext();

  return {
    phase,
    isConnected:
      phase === 'connected' || phase === 'measuring' || phase === 'done',
    isConnecting: phase === 'connecting',
    connectedMac,
    connectedName,
    connect,
    disconnect,
  };
}
