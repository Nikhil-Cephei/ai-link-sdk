import { NativeModule, requireNativeModule } from "expo";
import { AiLinkSdkModuleEvents } from "./AiLinkSdk.types";

declare class AiLinkSdkModule extends NativeModule<AiLinkSdkModuleEvents> {
  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Initialise AILinkSDK and AILinkBleManager. Must be called once before scanning. */
  initSdk(): Promise<void>;

  // ── Scanning ────────────────────────────────────────────────────────────────

  /**
   * Start BLE scan for AILink devices.
   * @param timeout Duration in milliseconds. Pass 0 to scan indefinitely.
   */
  startScan(timeout: number): void;

  /** Stop an in-progress scan. */
  stopScan(): void;

  // ── Connection ──────────────────────────────────────────────────────────────

  /**
   * Connect to a device by MAC address.
   * Stops any active scan first. Fires onConnecting → onConnected.
   */
  connectDevice(mac: string): void;

  /** Disconnect all connected devices. Fires onDisconnected. */
  disconnectDevice(): void;

  // ── A6 utility commands (device must be connected) ──────────────────────────

  /** Request supported weight/height units from device. */
  getSupportUnit(): void;

  /** Request BLE module firmware version. */
  getBleVersion(): void;

  /** Request broadcast name. */
  getBleName(): void;

  /**
   * Set broadcast name on device (max 14 bytes UTF-8).
   */
  setBleName(name: string): void;

  // ── Height Body Fat Scale commands ──────────────────────────────────────────

  /**
   * Set device work mode. Send before user steps on scale.
   * Use WorkMode constants: HEIGHT_BODY_FAT=1, BABY=2, WEIGHT=3, WEIGHT_HEIGHT=4
   */
  sendWorkMode(mode: number): void;

  /**
   * Send user profile to scale. Required for body fat calculation.
   * @param gender 1=Male, 2=Female
   * @param age    1–120 years
   * @param heightCm  50–269 cm
   */
  sendUserData(gender: number, age: number, heightCm: number): void;

  /**
   * Set weight and height units together (iOS).
   * @param weightUnit 0=kg, 1=jin, 2=lb_oz, 6=lb
   * @param heightUnit 0=cm, 1=inch, 2=ft_in
   */
  setUnit(weightUnit: number, heightUnit: number): void;

  /**
   * Set weight unit (Android).
   * @param weightUnit 0=kg, 1=jin, 6=lb
   */
  setWeightUnit(weightUnit: number): void;

  /**
   * Set height unit (Android).
   * @param heightUnit 0=cm, 1=ft/inch
   */
  setHeightUnit(heightUnit: number): void;

  /** Notify scale that measurement session is complete. */
  sendWeighingCompleted(): void;
}

export default requireNativeModule<AiLinkSdkModule>("AiLinkSdk");
