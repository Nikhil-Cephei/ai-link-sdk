/**
 * useScaleMeasurement — live and final measurement data.
 *
 * Exposes all measurement output from a connected scale: streaming weight
 * updates, the final stable weight, height, impedance (ADC), and the
 * calculated body composition result. Resets automatically on disconnect.
 *
 * Must be used inside <ScaleProvider>.
 *
 * @example
 * const { liveWeight, bodyComposition, hasMeasurementData } = useScaleMeasurement();
 */
import type { ScaleErrorEvent } from '../AiLinkSdk.types';
import type {
  AdcReading,
  BodyComposition,
  HeightReading,
  MeasurementSession,
  WeightReading,
} from '../HeightBodyFatScale';
import { useScaleContext, type ScalePhase } from './ScaleContext';

export interface ScaleMeasurement {
  /** Current lifecycle phase (measuring | done when data is present). */
  phase: ScalePhase;
  /** True while stable weight or body-composition data is available. */
  hasMeasurementData: boolean;
  /**
   * Streaming weight updates.
   * isStable=false → live preview; isStable=true → locked final weight.
   */
  liveWeight: WeightReading | null;
  /** Last stable (locked) weight. Preserved until resetMeasurement(). */
  stableWeight: WeightReading | null;
  /** Height measured by the scale's ultrasonic height sensor. */
  heightReading: HeightReading | null;
  /**
   * Bio-electrical impedance state.
   * isSuccess=true → ADC value is ready; feed it to the body-fat algorithm.
   * state=2 → measurement failed; ask user to stand barefoot on the electrodes.
   */
  adcReading: AdcReading | null;
  /** Body composition result from the scale's MCU firmware. */
  bodyComposition: BodyComposition | null;
  /** Snapshot of all readings collected in the current session. */
  session: MeasurementSession;
  /** Scale-reported error (e.g. code 1 = overweight). null when no error. */
  scaleError: ScaleErrorEvent | null;
  /** Clear all measurement state and return to the connected (idle) phase. */
  resetMeasurement: () => void;
}

export function useScaleMeasurement(): ScaleMeasurement {
  const {
    phase,
    liveWeight,
    stableWeight,
    heightReading,
    adcReading,
    bodyComposition,
    session,
    scaleError,
    resetMeasurement,
  } = useScaleContext();

  return {
    phase,
    hasMeasurementData: phase === 'measuring' || phase === 'done',
    liveWeight,
    stableWeight,
    heightReading,
    adcReading,
    bodyComposition,
    session,
    scaleError,
    resetMeasurement,
  };
}
