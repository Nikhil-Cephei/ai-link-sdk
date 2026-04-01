/**
 * useScaleScan — BLE device discovery.
 *
 * Manages scanning and the list of discovered devices. Duplicate MACs are
 * filtered automatically. The device list resets on each new scan.
 *
 * Must be used inside <ScaleProvider>.
 *
 * @example
 * const { startScan, stopScan, devices, isScanning } = useScaleScan();
 * // Start a 30 s scan, then connect via useScaleConnection:
 * startScan(30_000);
 */
import type { BleDevice } from '../AiLinkSdk.types';
import { useScaleContext } from './ScaleContext';

export interface ScaleScan {
  /** Devices discovered since the last startScan() call. */
  devices: BleDevice[];
  /** True while a BLE scan is in progress. */
  isScanning: boolean;
  /**
   * Begin scanning for AILink devices.
   * @param timeoutMs Scan duration in ms. Pass 0 to scan indefinitely. Default: 30 000.
   */
  startScan: (timeoutMs?: number) => void;
  /** Stop an in-progress scan. */
  stopScan: () => void;
}

export function useScaleScan(): ScaleScan {
  const { devices, phase, startScan, stopScan } = useScaleContext();
  return { devices, isScanning: phase === 'scanning', startScan, stopScan };
}
