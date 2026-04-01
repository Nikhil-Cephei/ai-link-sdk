// ── BLE device ───────────────────────────────────────────────────────────────

export type BleDevice = {
  mac: string;
  name: string;
  rssi: number;
};

// ── Scan events ───────────────────────────────────────────────────────────────

export type ScanErrorEvent = {
  /** 1=too frequent, 2=failed 3×, 3=hardware/permission, -1=prereq check failed */
  type: number;
  time: number;
  /** Human-readable reason when type=-1 */
  message?: string;
};

// ── Connection events ─────────────────────────────────────────────────────────

export type BleStateEvent = {
  /** "on" | "off" */
  state: string;
};

export type ConnectionEvent = { mac: string };
export type ConnectedEvent = { mac: string; name: string };
export type DisconnectedEvent = {
  mac: string;
  /** -1=timeout, 0=app disconnect, 19=device off, 133=BLE error */
  code: number;
};

// ── Raw data pass-through ─────────────────────────────────────────────────────

/** Raw A7 (MCU) notification bytes */
export type NotifyDataEvent = {
  uuid: string;
  /** Byte values 0–255 */
  data: number[];
  /** CID / device type */
  type: number;
};

/** Raw A6 (BLE module) notification bytes */
export type NotifyDataA6Event = {
  uuid: string;
  data: number[];
};

// ── Height Body Fat Scale measurement events ──────────────────────────────────

/**
 * Weight measurement update.
 * `stable`: 0=live preview, 1=locked final weight (use for body fat algorithm).
 * Actual value: `weight / 10^point` in the given unit.
 * `unit`: 0=kg, 1=lb, 2=jin (Android) | 0=kg, 1=jin, 2=lb_oz, 6=lb (iOS raw)
 */
export type WeightDataEvent = {
  stable: 0 | 1;
  weight: number;
  point: number;
  unit: number;
};

/**
 * Impedance (ADC) measurement result.
 * `state`:
 *   0 = measuring (in progress)
 *   1 = success — use app algorithm with this ADC value
 *   2 = failed — electrodes not contacted, ask user to stand barefoot
 *   3 = success — MCU algorithm already ran, onBodyFatData will follow
 *   4 = over/complete
 * `aisle`: 0=both feet, 1=both hands, 2=left hand, 3=right hand, 4=left foot, 5=right foot, …
 */
export type AdcDataEvent = {
  state: 0 | 1 | 2 | 3 | 4;
  aisle: number;
  adc: number;
  algorithmId: number;
};

/**
 * Pre-calculated body composition delivered by MCU firmware.
 * All percentage fields need /10 to get the real value (e.g. bfr=212 → 21.2%).
 * Integer fields (bmr, bodyAge, uvi, heartRate, obesityGrade) are already final.
 */
export type BodyFatDataEvent = {
  /** Body fat rate × 10 */
  bfr: number;
  /** Subcutaneous fat rate × 10 */
  sfr: number;
  /** Visceral fat index (integer) */
  uvi: number;
  /** Muscle rate × 10 */
  rom: number;
  /** Basal metabolic rate kcal (integer) */
  bmr: number;
  /** Physical / body age (integer) */
  bodyAge: number;
  /** Bone mass × 10 */
  bm: number;
  /** Body water (VWC) × 10 */
  vwc: number;
  /** Protein rate × 10 */
  pp: number;
  /** BMI × 10 */
  bmi: number;
  /** Heart rate bpm (integer) */
  heartRate: number;
  /** Obesity grade 0=thin, 1=healthy, 2=obese, 3=exceed */
  obesityGrade: number;
};

/**
 * Height measurement.
 * Actual value: `height / 10^point` in the given unit.
 * `unit`: 0=cm, 1=inch, 2=ft_in, 3=m
 */
export type HeightDataEvent = {
  height: number;
  unit: number;
  point: number;
};

export type ScaleErrorEvent = {
  /** 1=overweight */
  code: number;
};

// ── All module events ─────────────────────────────────────────────────────────

export type AiLinkSdkModuleEvents = {
  // BLE lifecycle
  onStartScan: (param: Record<"isScanning", boolean>) => void;
  onDeviceFound: (param: BleDevice) => void;
  onScanTimeOut: (param: Record<"isScanning", boolean>) => void;
  onScanError: (param: ScanErrorEvent) => void;
  onBleStateChange: (param: BleStateEvent) => void;
  onConnecting: (param: ConnectionEvent) => void;
  onConnected: (param: ConnectedEvent) => void;
  onDisconnected: (param: DisconnectedEvent) => void;
  // Raw data
  onNotifyData: (param: NotifyDataEvent) => void;
  onNotifyDataA6: (param: NotifyDataA6Event) => void;
  // Height Body Fat Scale
  onRequestUserData: (param: Record<string, never>) => void;
  onWeightData: (param: WeightDataEvent) => void;
  onAdcData: (param: AdcDataEvent) => void;
  onBodyFatData: (param: BodyFatDataEvent) => void;
  onHeightData: (param: HeightDataEvent) => void;
  onScaleError: (param: ScaleErrorEvent) => void;
};

// ── Work mode constants ───────────────────────────────────────────────────────

/** Device work mode values for sendWorkMode(). */
export const WorkMode = {
  /** Height + weight + impedance (full measurement) */
  HEIGHT_BODY_FAT: 1,
  /** Baby weighing mode (hold baby) */
  BABY: 2,
  /** Weight + impedance only (no height sensor) */
  WEIGHT: 3,
  /** Weight + height (no impedance) */
  WEIGHT_HEIGHT: 4,
} as const;

export type WorkModeValue = (typeof WorkMode)[keyof typeof WorkMode];

// ── Unit constants ────────────────────────────────────────────────────────────

export const WeightUnit = {
  KG: 0,
  JIN: 1,
  LB: 6,
} as const;

export const HeightUnit = {
  CM: 0,
  INCH: 1,
  FT: 2,
} as const;
