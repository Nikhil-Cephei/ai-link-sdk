/**
 * useScaleCommands — device configuration and session control.
 *
 * Commands that configure how the scale measures and reports data.
 * All commands require an active connection (use after useScaleConnection
 * reports isConnected === true).
 *
 * Must be used inside <ScaleProvider>.
 *
 * @example
 * const { setWorkMode, setUnits, completeWeighing } = useScaleCommands();
 * setWorkMode(WorkMode.HEIGHT_BODY_FAT); // set BEFORE user steps on scale
 */
import type { WorkModeValue } from '../AiLinkSdk.types';
import { useScaleContext } from './ScaleContext';

export interface ScaleCommands {
  /**
   * Set the measurement mode. Must be called BEFORE the user steps on the
   * scale. Defaults to HEIGHT_BODY_FAT (full measurement).
   *
   * WorkMode constants: HEIGHT_BODY_FAT=1, BABY=2, WEIGHT=3, WEIGHT_HEIGHT=4
   */
  setWorkMode: (mode?: WorkModeValue) => void;
  /**
   * Set the weight and height display units.
   * @param weightUnit WeightUnit.KG=0 | WeightUnit.JIN=1 | WeightUnit.LB=6
   * @param heightUnit HeightUnit.CM=0 | HeightUnit.INCH=1 | HeightUnit.FT=2
   */
  setUnits: (weightUnit: number, heightUnit: number) => void;
  /** Signal the scale that the current measurement session is complete. */
  completeWeighing: () => void;
}

export function useScaleCommands(): ScaleCommands {
  const { setWorkMode, setUnits, completeWeighing } = useScaleContext();
  return { setWorkMode, setUnits, completeWeighing };
}
