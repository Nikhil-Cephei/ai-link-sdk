import { EventSubscription, Platform } from "expo-modules-core";
import {
  AdcDataEvent,
  BleDevice,
  BodyFatDataEvent,
  HeightDataEvent,
  HeightUnit,
  ScaleErrorEvent,
  WeightDataEvent,
  WeightUnit,
  WorkMode,
  WorkModeValue,
} from "./AiLinkSdk.types";
import AiLinkSdkModule from "./AiLinkSdkModule";

// ── User profile ──────────────────────────────────────────────────────────────

export interface UserProfile {
  /** 1=Male, 2=Female */
  gender: 1 | 2;
  /** 1–120 years */
  age: number;
  /** 50–269 cm */
  heightCm: number;
}

// ── Measurement result ────────────────────────────────────────────────────────

export interface WeightReading {
  /** Whether this is the final locked-in weight (true) or a live preview (false). */
  isStable: boolean;
  /** Weight value (raw integer). Divide by 10^point for actual value. */
  rawValue: number;
  /** Decimal places. actualWeight = rawValue / 10^point */
  point: number;
  /** Convenience: rawValue / 10^point */
  value: number;
  /** Raw unit code. 0=kg, 1=lb(Android)/jin(iOS), 2=jin(Android)/lb_oz(iOS), 6=lb(iOS) */
  unit: number;
}

export interface HeightReading {
  /** Height value (raw integer). Divide by 10^point for actual value. */
  rawValue: number;
  /** Decimal places. actualHeight = rawValue / 10^point */
  point: number;
  /** Convenience: rawValue / 10^point */
  value: number;
  /** Raw unit code. 0=cm, 1=inch, 2=ft_in, 3=m */
  unit: number;
}

export interface AdcReading {
  /** 0=measuring, 1=success(run app algo), 2=failed, 3=success(MCU ran algo), 4=over */
  state: number;
  aisle: number;
  adcValue: number;
  algorithmId: number;
  /** True when ADC is ready to feed into the body fat algorithm. */
  isSuccess: boolean;
}

/**
 * Body composition metrics.
 * All *Rate fields are percentages (divide by 10 if raw from onBodyFatData).
 */
export interface BodyComposition {
  /** Body fat % */
  bodyFatRate: number;
  /** Subcutaneous fat % */
  subcutaneousFatRate: number;
  /** Visceral fat index (integer, 1–20+) */
  visceralFatIndex: number;
  /** Muscle rate % */
  muscleRate: number;
  /** Basal metabolic rate kcal */
  bmr: number;
  /** Physical age years */
  physicalAge: number;
  /** Bone mass % */
  boneMass: number;
  /** Body water % */
  bodyWater: number;
  /** Protein rate % */
  proteinRate: number;
  /** BMI */
  bmi: number;
  /** Heart rate bpm */
  heartRate: number;
  /** 0=thin, 1=healthy, 2=obese, 3=exceed */
  obesityGrade: number;
}

// ── Session state ─────────────────────────────────────────────────────────────

export interface MeasurementSession {
  finalWeight?: WeightReading;
  finalHeight?: HeightReading;
  adcReading?: AdcReading;
  bodyComposition?: BodyComposition;
}

// ── Callbacks ─────────────────────────────────────────────────────────────────

export interface HeightBodyFatScaleCallbacks {
  /** Scale found during scan. */
  onDeviceFound?: (device: BleDevice) => void;
  /** Scale is requesting user profile — sendUserData is called automatically if userProfile is set. */
  onUserDataRequested?: () => void;
  /** Live or final weight update. */
  onWeight?: (reading: WeightReading) => void;
  /** Impedance (ADC) state change. */
  onAdc?: (reading: AdcReading) => void;
  /**
   * Body composition from MCU firmware (pre-calculated path).
   * Also fires when session is complete via onBodyFatData event.
   */
  onBodyComposition?: (
    data: BodyComposition,
    session: MeasurementSession,
  ) => void;
  /** Height measurement arrived. */
  onHeight?: (reading: HeightReading, session: MeasurementSession) => void;
  /** Device error. code: 1=overweight. */
  onError?: (error: ScaleErrorEvent) => void;
  /** Connection established. */
  onConnected?: (mac: string, name: string) => void;
  /** Connection lost. */
  onDisconnected?: (mac: string, code: number) => void;
  /** BLE adapter state changed. */
  onBleState?: (state: "on" | "off") => void;
  /** Scan timed out. */
  onScanTimeout?: () => void;
}

// ── Manager class ─────────────────────────────────────────────────────────────

/**
 * HeightBodyFatScale — modular manager for the AILink height + body fat scale.
 *
 * Usage:
 * ```ts
 * const scale = new HeightBodyFatScale({ gender: 1, age: 28, heightCm: 175 });
 * await scale.init();
 * scale.on({ onWeight: (r) => console.log(r.value), onBodyComposition: (c) => ... });
 * scale.startScan(30_000);
 * ```
 */
export class HeightBodyFatScale {
  private subscriptions: EventSubscription[] = [];
  private session: MeasurementSession = {};
  private userProfile?: UserProfile;
  private callbacks: HeightBodyFatScaleCallbacks = {};

  constructor(profile?: UserProfile) {
    this.userProfile = profile;
  }

  // ── Setup ───────────────────────────────────────────────────────────────────

  /** Initialise native SDK. Must be called once before any BLE operations. */
  async init(): Promise<void> {
    await AiLinkSdkModule.initSdk();
    this._subscribeAll();
  }

  /** Register callbacks. Can be called multiple times — new values are merged. */
  on(callbacks: HeightBodyFatScaleCallbacks): this {
    this.callbacks = { ...this.callbacks, ...callbacks };
    return this;
  }

  /** Update user profile used when scale requests data. */
  setProfile(profile: UserProfile): this {
    this.userProfile = profile;
    return this;
  }

  // ── Scanning ────────────────────────────────────────────────────────────────

  /** Start scanning for devices. @param timeoutMs 0=indefinite */
  startScan(timeoutMs = 30_000): void {
    AiLinkSdkModule.startScan(timeoutMs);
  }

  stopScan(): void {
    AiLinkSdkModule.stopScan();
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  /** Connect to a device by MAC address (obtained from onDeviceFound). */
  connect(mac: string): void {
    AiLinkSdkModule.connectDevice(mac);
  }

  disconnect(): void {
    AiLinkSdkModule.disconnectDevice();
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  /**
   * Set device work mode. Call BEFORE the user steps on the scale.
   * Defaults to HEIGHT_BODY_FAT (full measurement).
   */
  setWorkMode(mode: WorkModeValue = WorkMode.HEIGHT_BODY_FAT): void {
    AiLinkSdkModule.sendWorkMode(mode);
  }

  /** Manually send user profile (called automatically on onRequestUserData). */
  sendUserData(profile?: UserProfile): void {
    const p = profile ?? this.userProfile;
    if (!p) {
      console.warn("[HeightBodyFatScale] sendUserData: no user profile set");
      return;
    }
    AiLinkSdkModule.sendUserData(p.gender, p.age, p.heightCm);
  }

  /**
   * Set weight + height units.
   * iOS: both set together. Android: set individually via setWeightUnit / setHeightUnit.
   */
  setUnits(
    weightUnit: number = WeightUnit.KG,
    heightUnit: number = HeightUnit.CM,
  ): void {
    if (Platform.OS === "ios") {
      AiLinkSdkModule.setUnit(weightUnit, heightUnit);
    } else {
      AiLinkSdkModule.setWeightUnit(weightUnit);
      AiLinkSdkModule.setHeightUnit(heightUnit);
    }
  }

  /** Notify scale that measurement is complete. */
  completeWeighing(): void {
    AiLinkSdkModule.sendWeighingCompleted();
  }

  /** Reset the in-progress measurement session. */
  resetSession(): void {
    this.session = {};
  }

  /** Current measurement session snapshot. */
  getSession(): Readonly<MeasurementSession> {
    return this.session;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  /** Remove all event subscriptions. Call when unmounting. */
  destroy(): void {
    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
  }

  // ── Private: event wiring ────────────────────────────────────────────────────

  private _subscribeAll(): void {
    this.subscriptions.push(
      AiLinkSdkModule.addListener("onDeviceFound", (e) => {
        this.callbacks.onDeviceFound?.(e);
      }),

      AiLinkSdkModule.addListener("onBleStateChange", (e) => {
        this.callbacks.onBleState?.(e.state as "on" | "off");
      }),

      AiLinkSdkModule.addListener("onConnected", (e) => {
        this.resetSession();
        this.callbacks.onConnected?.(e.mac, e.name);
      }),

      AiLinkSdkModule.addListener("onDisconnected", (e) => {
        this.callbacks.onDisconnected?.(e.mac, e.code);
      }),

      AiLinkSdkModule.addListener("onScanTimeOut", () => {
        this.callbacks.onScanTimeout?.();
      }),

      AiLinkSdkModule.addListener("onRequestUserData", () => {
        this.callbacks.onUserDataRequested?.();
        // Auto-respond with stored profile
        this.sendUserData();
      }),

      AiLinkSdkModule.addListener("onWeightData", (e: WeightDataEvent) => {
        const reading = this._parseWeight(e);
        if (reading.isStable) {
          this.session.finalWeight = reading;
        }
        this.callbacks.onWeight?.(reading);
      }),

      AiLinkSdkModule.addListener("onAdcData", (e: AdcDataEvent) => {
        const reading: AdcReading = {
          state: e.state,
          aisle: e.aisle,
          adcValue: e.adc,
          algorithmId: e.algorithmId,
          isSuccess: e.state === 1 || e.state === 3,
        };
        this.session.adcReading = reading;
        this.callbacks.onAdc?.(reading);
      }),

      AiLinkSdkModule.addListener("onBodyFatData", (e: BodyFatDataEvent) => {
        const composition = this._parseBodyFat(e);
        this.session.bodyComposition = composition;
        this.callbacks.onBodyComposition?.(composition, { ...this.session });
      }),

      AiLinkSdkModule.addListener("onHeightData", (e: HeightDataEvent) => {
        const reading = this._parseHeight(e);
        this.session.finalHeight = reading;
        this.callbacks.onHeight?.(reading, { ...this.session });
      }),

      AiLinkSdkModule.addListener("onScaleError", (e: ScaleErrorEvent) => {
        this.callbacks.onError?.(e);
      }),
    );
  }

  // ── Private: data parsing ─────────────────────────────────────────────────

  private _parseWeight(e: WeightDataEvent): WeightReading {
    const value = e.weight / Math.pow(10, e.point);
    return {
      isStable: e.stable === 1,
      rawValue: e.weight,
      point: e.point,
      value,
      unit: e.unit,
    };
  }

  private _parseHeight(e: HeightDataEvent): HeightReading {
    const value = e.height / Math.pow(10, e.point);
    return {
      rawValue: e.height,
      point: e.point,
      value,
      unit: e.unit,
    };
  }

  private _parseBodyFat(e: BodyFatDataEvent): BodyComposition {
    // MCU sends values × 10 for rate fields; integer fields are already final.
    return {
      bodyFatRate: e.bfr / 10,
      subcutaneousFatRate: e.sfr / 10,
      visceralFatIndex: e.uvi,
      muscleRate: e.rom / 10,
      bmr: e.bmr,
      physicalAge: e.bodyAge,
      boneMass: e.bm / 10,
      bodyWater: e.vwc / 10,
      proteinRate: e.pp / 10,
      bmi: e.bmi / 10,
      heartRate: e.heartRate,
      obesityGrade: e.obesityGrade,
    };
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { HeightUnit, WeightUnit, WorkMode };
