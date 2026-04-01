// Types
export * from "./src/AiLinkSdk.types";

// Native module (raw access)
export { default as AiLinkSdkModule } from "./src/AiLinkSdkModule";

// HeightBodyFatScale — imperative class API
export {
  HeightBodyFatScale,
  WorkMode,
  WeightUnit,
  HeightUnit,
} from "./src/HeightBodyFatScale";

export type {
  UserProfile,
  WeightReading,
  HeightReading,
  AdcReading,
  BodyComposition,
  MeasurementSession,
  HeightBodyFatScaleCallbacks,
} from "./src/HeightBodyFatScale";

// React hooks — declarative API
export {
  ScaleProvider,
  useScaleSetup,
  useScaleScan,
  useScaleConnection,
  useScaleProfile,
  useScaleCommands,
  useScaleMeasurement,
} from "./src/hooks";

export type {
  ScaleContextValue,
  ScalePhase,
  ScaleProviderProps,
  ScaleSetup,
  ScaleScan,
  ScaleConnection,
  ScaleProfile,
  ScaleCommands,
  ScaleMeasurement,
} from "./src/hooks";

// Zustand + MMKV connection store
export { useBleStore } from "./src/store/bleStore";
export type { ConnectState, SupportedUnits } from "./src/store/bleStore";
