/**
 * ScaleContext — shared state store for all useScale* hooks.
 *
 * Wrap your screen tree with <ScaleProvider> once (e.g. in _layout.tsx), then
 * call the individual feature hooks (useScaleSetup, useScaleScan, …) anywhere
 * inside that tree. Each hook exposes only the slice of state it owns.
 *
 * @example
 * // _layout.tsx
 * <ScaleProvider>
 *   <Stack />
 * </ScaleProvider>
 *
 * // Any child screen
 * const { init, isInitialized } = useScaleSetup();
 * const { startScan, devices } = useScaleScan();
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BleDevice, ScaleErrorEvent, WorkModeValue } from '../AiLinkSdk.types';
import {
  HeightBodyFatScale,
  HeightUnit,
  WeightUnit,
  WorkMode,
  type AdcReading,
  type BodyComposition,
  type HeightReading,
  type MeasurementSession,
  type UserProfile,
  type WeightReading,
} from '../HeightBodyFatScale';

// ── Phase ─────────────────────────────────────────────────────────────────────

/**
 * Overall lifecycle phase of the scale session.
 * idle → scanning → (idle|connecting) → connected → measuring → done
 */
export type ScalePhase =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'measuring'
  | 'done';

// ── Context shape ─────────────────────────────────────────────────────────────

export interface ScaleContextValue {
  // Setup
  isInitialized: boolean;
  initError: string | null;
  bleState: 'on' | 'off' | null;
  init: () => Promise<void>;
  // Scan
  devices: BleDevice[];
  startScan: (timeoutMs?: number) => void;
  stopScan: () => void;
  // Connection
  phase: ScalePhase;
  connectedMac: string | null;
  connectedName: string | null;
  connect: (mac: string) => void;
  disconnect: () => void;
  // Profile
  userProfile: UserProfile;
  updateProfile: (profile: UserProfile) => void;
  // Commands
  setWorkMode: (mode?: WorkModeValue) => void;
  setUnits: (weightUnit: number, heightUnit: number) => void;
  completeWeighing: () => void;
  // Measurement
  liveWeight: WeightReading | null;
  stableWeight: WeightReading | null;
  heightReading: HeightReading | null;
  adcReading: AdcReading | null;
  bodyComposition: BodyComposition | null;
  session: MeasurementSession;
  scaleError: ScaleErrorEvent | null;
  resetMeasurement: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ScaleContext = createContext<ScaleContextValue | null>(null);

/** @internal Used by every useScale* hook. Throws outside <ScaleProvider>. */
export function useScaleContext(): ScaleContextValue {
  const ctx = useContext(ScaleContext);
  if (!ctx) {
    throw new Error('useScale* hooks must be used inside <ScaleProvider>');
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: UserProfile = { gender: 1, age: 28, heightCm: 170 };

export interface ScaleProviderProps {
  children: ReactNode;
  /** Initial biometric profile for body-fat calculations. Defaults to male, 28 yrs, 170 cm. */
  initialProfile?: UserProfile;
}

export function ScaleProvider({
  children,
  initialProfile = DEFAULT_PROFILE,
}: ScaleProviderProps) {
  // HeightBodyFatScale instance is created lazily and lives for the provider's lifetime.
  const scaleRef = useRef<HeightBodyFatScale | null>(null);
  // Dedup scanned devices by MAC without causing extra renders.
  const seenMacsRef = useRef(new Set<string>());
  // Always holds the latest profile so stale-closure callbacks always send
  // the current values without needing userProfile in every dep array.
  const userProfileRef = useRef<UserProfile>(initialProfile);

  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [bleState, setBleState] = useState<'on' | 'off' | null>(null);

  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [phase, setPhase] = useState<ScalePhase>('idle');
  const [connectedMac, setConnectedMac] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);

  const [userProfile, setUserProfileState] = useState<UserProfile>(initialProfile);

  const [liveWeight, setLiveWeight] = useState<WeightReading | null>(null);
  const [stableWeight, setStableWeight] = useState<WeightReading | null>(null);
  const [heightReading, setHeightReading] = useState<HeightReading | null>(null);
  const [adcReading, setAdcReading] = useState<AdcReading | null>(null);
  const [bodyComposition, setBodyComposition] = useState<BodyComposition | null>(null);
  const [session, setSession] = useState<MeasurementSession>({});
  const [scaleError, setScaleError] = useState<ScaleErrorEvent | null>(null);

  // Lazily creates the HeightBodyFatScale instance with the current profile.
  const getScale = useCallback(() => {
    if (!scaleRef.current) {
      scaleRef.current = new HeightBodyFatScale(userProfileRef.current);
    }
    return scaleRef.current;
  }, []);

  const init = useCallback(async () => {
    const scale = getScale();

    scale.on({
      onDeviceFound: (device) => {
        if (seenMacsRef.current.has(device.mac)) return;
        seenMacsRef.current.add(device.mac);
        setDevices((prev) => [...prev, device]);
      },
      onBleState: (state) => setBleState(state),
      onConnected: (mac, name) => {
        setConnectedMac(mac);
        setConnectedName(name);
        setPhase('connected');
      },
      onDisconnected: () => {
        setConnectedMac(null);
        setConnectedName(null);
        setPhase('idle');
        setLiveWeight(null);
        setStableWeight(null);
        setHeightReading(null);
        setAdcReading(null);
        setBodyComposition(null);
        setSession({});
        setScaleError(null);
      },
      // Auto-sync the latest profile before the scale sends userData automatically.
      onUserDataRequested: () => {
        scaleRef.current?.setProfile(userProfileRef.current);
      },
      onScanTimeout: () => {
        setPhase((p) => (p === 'scanning' ? 'idle' : p));
      },
      onWeight: (reading) => {
        setLiveWeight(reading);
        if (reading.isStable) {
          setStableWeight(reading);
          setPhase('measuring');
        }
      },
      onAdc: (reading) => setAdcReading(reading),
      onHeight: (reading, sess) => {
        setHeightReading(reading);
        setSession({ ...sess });
      },
      onBodyComposition: (data, sess) => {
        setBodyComposition(data);
        setSession({ ...sess });
        setPhase('done');
      },
      onError: (err) => setScaleError(err),
    });

    try {
      await scale.init();
      setIsInitialized(true);
      setInitError(null);
    } catch (e: unknown) {
      setInitError(e instanceof Error ? e.message : String(e));
      setIsInitialized(false);
    }
  }, [getScale]);

  const startScan = useCallback(
    (timeoutMs = 30_000) => {
      setDevices([]);
      seenMacsRef.current.clear();
      setPhase('scanning');
      getScale().startScan(timeoutMs);
    },
    [getScale],
  );

  const stopScan = useCallback(() => {
    getScale().stopScan();
    setPhase('idle');
  }, [getScale]);

  const connect = useCallback(
    (mac: string) => {
      setPhase('connecting');
      getScale().connect(mac);
    },
    [getScale],
  );

  const disconnect = useCallback(() => {
    getScale().disconnect();
  }, [getScale]);

  const setWorkMode = useCallback(
    (mode: WorkModeValue = WorkMode.HEIGHT_BODY_FAT) => {
      getScale().setWorkMode(mode);
    },
    [getScale],
  );

  const updateProfile = useCallback((profile: UserProfile) => {
    setUserProfileState(profile);
    // Update the ref immediately so any concurrent callbacks use the new value.
    userProfileRef.current = profile;
    // Sync to the scale instance if it already exists.
    scaleRef.current?.setProfile(profile);
  }, []);

  const setUnits = useCallback(
    (weightUnit: number = WeightUnit.KG, heightUnit: number = HeightUnit.CM) => {
      getScale().setUnits(weightUnit, heightUnit);
    },
    [getScale],
  );

  const completeWeighing = useCallback(() => {
    getScale().completeWeighing();
  }, [getScale]);

  const resetMeasurement = useCallback(() => {
    getScale().resetSession();
    setLiveWeight(null);
    setStableWeight(null);
    setHeightReading(null);
    setAdcReading(null);
    setBodyComposition(null);
    setSession({});
    setScaleError(null);
    setPhase('connected');
  }, [getScale]);

  // Destroy the scale instance when the provider unmounts.
  useEffect(() => {
    return () => {
      scaleRef.current?.destroy();
      scaleRef.current = null;
    };
  }, []);

  const value: ScaleContextValue = {
    isInitialized,
    initError,
    bleState,
    init,
    devices,
    startScan,
    stopScan,
    phase,
    connectedMac,
    connectedName,
    connect,
    disconnect,
    userProfile,
    updateProfile,
    setWorkMode,
    setUnits,
    completeWeighing,
    liveWeight,
    stableWeight,
    heightReading,
    adcReading,
    bodyComposition,
    session,
    scaleError,
    resetMeasurement,
  };

  return <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>;
}
