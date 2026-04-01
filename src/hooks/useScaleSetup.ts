/**
 * useScaleSetup — SDK initialisation and BLE adapter state.
 *
 * Call `init()` once (e.g. on a button press or inside a useEffect) before
 * using any other scale functionality. All other hooks block or no-op until
 * the SDK is ready.
 *
 * Must be used inside <ScaleProvider>.
 *
 * @example
 * const { init, isInitialized, initError, bleState } = useScaleSetup();
 * useEffect(() => { init(); }, [init]);
 */
import { useScaleContext } from './ScaleContext';

export interface ScaleSetup {
  /** True after init() resolves successfully. */
  isInitialized: boolean;
  /** Error message if init() threw, otherwise null. */
  initError: string | null;
  /** BLE adapter state. null before the first hardware event arrives. */
  bleState: 'on' | 'off' | null;
  /** Initialise the native SDK and wire all event listeners. Idempotent. */
  init: () => Promise<void>;
}

export function useScaleSetup(): ScaleSetup {
  const { isInitialized, initError, bleState, init } = useScaleContext();
  return { isInitialized, initError, bleState, init };
}
