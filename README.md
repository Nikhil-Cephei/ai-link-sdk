# ai-link-sdk

An Expo native module for the **AILink BLE Height + Body Fat Scale** family.

Wraps the AILink iOS (`AILinkBleSDK.framework`) and Android (`AILinkSDKRepositoryAndroid`) SDKs and exposes them through a layered TypeScript API:

| Layer | Export | Use when |
|---|---|---|
| React hooks (declarative) | `ScaleProvider` + `useScale*` | Building screens — the recommended path |
| Imperative class | `HeightBodyFatScale` | Headless logic, services, non-React code |
| Raw native module | `AiLinkSdkModule` | Debugging, custom event wiring |
| Connection store | `useBleStore` | Persisting last-connected device across sessions |

---

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
  - [As a local Expo module](#as-a-local-expo-module)
  - [As an npm package](#as-an-npm-package)
- [Expo config plugin](#expo-config-plugin)
- [Platform setup](#platform-setup)
  - [iOS](#ios)
  - [Android](#android)
- [Quick start](#quick-start)
- [API — React hooks](#api--react-hooks)
  - [ScaleProvider](#scaleprovider)
  - [useScaleSetup](#usescalesetup)
  - [useScaleScan](#usescalescan)
  - [useScaleConnection](#usescaleconnection)
  - [useScaleProfile](#usescaleprofile)
  - [useScaleCommands](#usescalecommands)
  - [useScaleMeasurement](#usescalemeasurement)
- [API — Connection store](#api--connection-store)
- [API — Imperative class](#api--imperative-class)
- [API — Raw native module](#api--raw-native-module)
- [Types reference](#types-reference)
- [Measurement lifecycle](#measurement-lifecycle)
- [Constants](#constants)

---

## Requirements

| Dependency | Version |
|---|---|
| `expo` | ≥ 51 |
| `expo-modules-core` | ≥ 2.0 |
| `react` | ≥ 18 |
| `react-native` | ≥ 0.73 |
| `zustand` | ≥ 4.0 |
| `react-native-mmkv` | ≥ 3.0 |
| `react-native-permissions` | ≥ 4.0 |

> All five of the last rows are **peer dependencies** — you must install them in your app.

---

## Installation

### As a local Expo module

Copy (or symlink) the `modules/ai-link-sdk` directory into your project, then add it to your workspace:

```
your-app/
  modules/
    ai-link-sdk/      ← this directory
  package.json
  app.config.ts
```

Install peer dependencies:

```sh
npx expo install zustand react-native-mmkv react-native-permissions
```

Expo's autolinking picks up the module automatically from the `modules/` directory — no extra configuration needed.

### As an npm package

```sh
npx expo install ai-link-sdk zustand react-native-mmkv react-native-permissions
```

---

## Expo config plugin

The module ships a config plugin that patches **AndroidManifest.xml** with all BLE permissions, hardware features, and the AILink foreground service declaration.

Add it to `app.config.ts` (or `app.json`):

```ts
// app.config.ts
export default {
  plugins: [
    // local module path:
    ["./modules/ai-link-sdk/plugin", { backgroundLocation: false }],
    // or, when installed as an npm package:
    // ["ai-link-sdk", { backgroundLocation: false }],

    // Required for iOS permission strings:
    ["react-native-permissions", { iosPermissions: ["Bluetooth", "LocationWhenInUse"] }],
  ],
};
```

### Plugin options

| Option | Type | Default | Description |
|---|---|---|---|
| `backgroundLocation` | `boolean` | `false` | Adds `ACCESS_BACKGROUND_LOCATION`. Required only if your app scans for BLE devices while fully backgrounded (e.g. inside a foreground service). Adds Play Store review friction — leave `false` unless needed. |

The plugin adds the following to `AndroidManifest.xml`:

```xml
<!-- Location -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Legacy Bluetooth (API ≤ 30) -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- Android 12+ Bluetooth -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" tools:targetApi="s" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />

<!-- Foreground service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />

<!-- Hardware features (not required, avoids device filtering on stores) -->
<uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
<uses-feature android:name="android.hardware.bluetooth" android:required="false" />
```

---

## Platform setup

### iOS

1. **Add the vendored framework** — copy `AILinkBleSDK.framework` into `modules/ai-link-sdk/ios/Framework/`.

2. **Add usage descriptions** to `app.config.ts` (the plugin does not manage iOS plist keys):

```ts
ios: {
  infoPlist: {
    NSBluetoothAlwaysUsageDescription:
      "This app uses Bluetooth to connect to the AILink BLE scale.",
    NSBluetoothPeripheralUsageDescription:
      "This app uses Bluetooth to connect to the AILink BLE scale.",
    NSLocationWhenInUseUsageDescription:
      "Location is used to scan for nearby BLE devices.",
  },
},
```

3. **Run pod install**:

```sh
cd ios && pod install
```

### Android

Everything is handled by the Expo config plugin. After adding the plugin to `app.config.ts`, run a new build:

```sh
npx expo prebuild --platform android   # or: npx expo run:android
```

---

## Quick start

### 1. Wrap your navigator with `ScaleProvider`

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';
import { ScaleProvider } from 'ai-link-sdk';   // or '../../modules/ai-link-sdk'

export default function RootLayout() {
  return (
    <ScaleProvider>
      <Stack />
    </ScaleProvider>
  );
}
```

### 2. Request Bluetooth permissions

Use `react-native-permissions` before initialising the SDK.
The module does not bundle a permissions hook — request permissions separately in your app.

### 3. Use feature hooks in your screens

```tsx
import {
  useScaleSetup,
  useScaleScan,
  useScaleConnection,
  useScaleMeasurement,
  WorkMode,
} from 'ai-link-sdk';

export default function ScaleScreen() {
  const { init, isInitialized, bleState } = useScaleSetup();
  const { startScan, devices, isScanning } = useScaleScan();
  const { connect, disconnect, isConnected } = useScaleConnection();
  const { liveWeight, bodyComposition, hasMeasurementData } = useScaleMeasurement();
  const { setWorkMode } = useScaleCommands();

  return (
    // ... your UI
  );
}
```

---

## API — React hooks

All hooks require a `<ScaleProvider>` ancestor. They throw with a clear message if used outside one.

---

### ScaleProvider

```tsx
import { ScaleProvider } from 'ai-link-sdk';

<ScaleProvider initialProfile={{ gender: 1, age: 28, heightCm: 170 }}>
  {children}
</ScaleProvider>
```

**Props**

| Prop | Type | Default | Description |
|---|---|---|---|
| `initialProfile` | `UserProfile` | `{ gender: 1, age: 28, heightCm: 170 }` | Biometric profile sent to the scale for body-fat calculation. Can be changed at any time via `useScaleProfile`. |
| `children` | `ReactNode` | — | Your app tree. |

Creates the `HeightBodyFatScale` instance lazily on first use, wires all native event listeners, and tears down the instance on unmount.

---

### useScaleSetup

SDK initialisation and BLE adapter state.

```ts
const { init, isInitialized, initError, bleState } = useScaleSetup();
```

| Return | Type | Description |
|---|---|---|
| `init` | `() => Promise<void>` | Initialise the native SDK and register event listeners. Call once (e.g. on a button press). Idempotent. |
| `isInitialized` | `boolean` | `true` after `init()` resolves successfully. |
| `initError` | `string \| null` | Error message if `init()` threw. |
| `bleState` | `'on' \| 'off' \| null` | BLE adapter state. `null` until the first hardware event arrives. |

---

### useScaleScan

BLE device discovery. Duplicate MACs are filtered automatically; the device list resets on each new scan.

```ts
const { startScan, stopScan, devices, isScanning } = useScaleScan();
```

| Return | Type | Description |
|---|---|---|
| `startScan` | `(timeoutMs?: number) => void` | Start scanning. `timeoutMs` defaults to 30 000 ms. Pass `0` for indefinite scan. |
| `stopScan` | `() => void` | Stop an in-progress scan. |
| `devices` | `BleDevice[]` | Devices found since the last `startScan()`. |
| `isScanning` | `boolean` | `true` while a scan is in progress. |

```ts
type BleDevice = {
  mac: string;
  name: string;
  rssi: number;
};
```

---

### useScaleConnection

Connection lifecycle.

```ts
const {
  connect, disconnect,
  isConnected, isConnecting,
  connectedMac, connectedName,
  phase,
} = useScaleConnection();
```

| Return | Type | Description |
|---|---|---|
| `connect` | `(mac: string) => void` | Connect to a device by MAC address (use a `mac` from `useScaleScan`). |
| `disconnect` | `() => void` | Disconnect the current device. |
| `isConnected` | `boolean` | `true` when `phase` is `connected`, `measuring`, or `done`. |
| `isConnecting` | `boolean` | `true` while a connection attempt is in progress. |
| `connectedMac` | `string \| null` | MAC address of the connected device. |
| `connectedName` | `string \| null` | Broadcast name of the connected device. |
| `phase` | `ScalePhase` | Granular lifecycle phase (see below). |

**ScalePhase**

```
idle → scanning → (idle | connecting) → connected → measuring → done
```

| Phase | Description |
|---|---|
| `idle` | No activity. |
| `scanning` | BLE scan in progress. |
| `connecting` | Connection attempt in progress. |
| `connected` | Device connected, no measurement started. |
| `measuring` | Stable weight received; body composition in progress. |
| `done` | Body composition received; session complete. |

---

### useScaleProfile

User biometric profile. Sent automatically whenever the scale requests user data.

```ts
const { userProfile, updateProfile } = useScaleProfile();
```

| Return | Type | Description |
|---|---|---|
| `userProfile` | `UserProfile` | Current profile in use. |
| `updateProfile` | `(profile: UserProfile) => void` | Update the profile. Syncs to the scale instance immediately — no need to reconnect. |

```ts
type UserProfile = {
  gender: 1 | 2;   // 1 = Male, 2 = Female
  age: number;      // 1–120 years
  heightCm: number; // 50–269 cm
};
```

---

### useScaleCommands

Device configuration commands. All require an active connection.

```ts
const { setWorkMode, setUnits, completeWeighing } = useScaleCommands();
```

| Return | Type | Description |
|---|---|---|
| `setWorkMode` | `(mode?: WorkModeValue) => void` | Set measurement mode. Call **before** the user steps on the scale. Defaults to `WorkMode.HEIGHT_BODY_FAT`. |
| `setUnits` | `(weightUnit: number, heightUnit: number) => void` | Set weight and height display units. Use `WeightUnit.*` and `HeightUnit.*` constants. |
| `completeWeighing` | `() => void` | Signal the scale that the current session is complete. |

---

### useScaleMeasurement

All live and final measurement data. Resets automatically on disconnect.

```ts
const {
  liveWeight, stableWeight,
  heightReading, adcReading, bodyComposition,
  session, scaleError,
  phase, hasMeasurementData,
  resetMeasurement,
} = useScaleMeasurement();
```

| Return | Type | Description |
|---|---|---|
| `liveWeight` | `WeightReading \| null` | Streaming weight updates. `isStable: false` → live preview; `isStable: true` → locked final weight. |
| `stableWeight` | `WeightReading \| null` | The last stable (locked) weight reading. Preserved until `resetMeasurement()`. |
| `heightReading` | `HeightReading \| null` | Height from the scale's ultrasonic sensor. |
| `adcReading` | `AdcReading \| null` | Bio-electrical impedance (BIA) state. See `AdcReading` below. |
| `bodyComposition` | `BodyComposition \| null` | Final body composition result from the scale's MCU. |
| `session` | `MeasurementSession` | Snapshot of all readings in the current session. |
| `scaleError` | `ScaleErrorEvent \| null` | Scale-reported error (`code: 1` = overweight). |
| `phase` | `ScalePhase` | Current lifecycle phase. |
| `hasMeasurementData` | `boolean` | `true` when `phase` is `measuring` or `done`. |
| `resetMeasurement` | `() => void` | Clear all measurement state and return to `connected` phase. |

---

## API — Connection store

A Zustand store backed by MMKV. Persists the last-connected device identity across app restarts to enable auto-reconnect.

```ts
import { useBleStore } from 'ai-link-sdk';

const {
  connectState,
  connectedMac,
  connectedName,
  lastConnectedMac,
  bleVersion,
  bleName,
  supportedUnits,
} = useBleStore();
```

**Persisted across sessions** (written to MMKV):

| Field | Type | Description |
|---|---|---|
| `lastConnectedMac` | `string \| null` | MAC address of the last successfully connected device. |
| `lastConnectedName` | `string \| null` | Display name of the last connected device. |

**Session state** (in-memory, resets on app kill):

| Field | Type | Description |
|---|---|---|
| `connectState` | `ConnectState` | `'disconnected' \| 'connecting' \| 'connected'` |
| `connectedMac` | `string \| null` | Active connection MAC. |
| `connectedName` | `string \| null` | Active connection name. |
| `bleVersion` | `string \| null` | BLE module firmware version (from `getBleVersion()`). |
| `bleName` | `string \| null` | Device broadcast name (from `getBleName()`). |
| `supportedUnits` | `SupportedUnits \| null` | Units supported by this device (from `getSupportUnit()`). |

**Actions:**

| Action | Signature | Description |
|---|---|---|
| `setConnecting` | `(mac: string) => void` | Mark a connection attempt. |
| `setConnected` | `(mac: string, name: string) => void` | Mark as connected; persists the device identity. |
| `setDisconnected` | `() => void` | Clear session state. |
| `setBleVersion` | `(v: string) => void` | Store parsed firmware version. |
| `setBleDeviceName` | `(n: string) => void` | Store parsed device name. |
| `setSupportedUnits` | `(u: SupportedUnits) => void` | Store parsed supported units. |
| `clearLastConnected` | `() => void` | Erase the persisted device identity. |

---

## API — Imperative class

Use `HeightBodyFatScale` when you need to manage the scale outside of React (e.g. a background task or a custom hook).

```ts
import { HeightBodyFatScale, WorkMode } from 'ai-link-sdk';

const scale = new HeightBodyFatScale({ gender: 1, age: 28, heightCm: 175 });

scale.on({
  onWeight:          (r) => console.log('weight', r.value, r.isStable),
  onHeight:          (r) => console.log('height', r.value),
  onBodyComposition: (c) => console.log('BMI', c.bmi),
  onConnected:       (mac, name) => scale.setWorkMode(WorkMode.HEIGHT_BODY_FAT),
  onError:           (e) => console.warn('scale error', e.code),
});

await scale.init();
scale.startScan(30_000);
// ... later
scale.destroy(); // removes all native event listeners
```

**Methods**

| Method | Signature | Description |
|---|---|---|
| `init` | `() => Promise<void>` | Initialise the native SDK and subscribe to all events. |
| `on` | `(callbacks: HeightBodyFatScaleCallbacks) => this` | Register callbacks. Multiple calls merge — new keys override old ones. |
| `setProfile` | `(profile: UserProfile) => this` | Update the user profile used for body-fat calculation. |
| `startScan` | `(timeoutMs?: number) => void` | Start BLE scan. Default 30 000 ms, `0` = indefinite. |
| `stopScan` | `() => void` | Stop scan. |
| `connect` | `(mac: string) => void` | Connect to a device by MAC. |
| `disconnect` | `() => void` | Disconnect the active device. |
| `setWorkMode` | `(mode?: WorkModeValue) => void` | Set measurement mode before user steps on scale. |
| `sendUserData` | `(profile?: UserProfile) => void` | Manually push user profile (called automatically on `onRequestUserData`). |
| `setUnits` | `(weightUnit: number, heightUnit: number) => void` | Set display units (cross-platform; handles iOS/Android differences internally). |
| `completeWeighing` | `() => void` | Signal session complete. |
| `resetSession` | `() => void` | Clear internal session snapshot. |
| `getSession` | `() => Readonly<MeasurementSession>` | Get the current session snapshot. |
| `destroy` | `() => void` | Remove all native event subscriptions. Call on unmount. |

---

## API — Raw native module

Direct access to the Expo native module. Use this only when you need to go below the class / hooks API.

```ts
import { AiLinkSdkModule } from 'ai-link-sdk';

// Initialise
await AiLinkSdkModule.initSdk();

// Scan
AiLinkSdkModule.startScan(30_000);
AiLinkSdkModule.stopScan();

// Connect
AiLinkSdkModule.connectDevice(mac);
AiLinkSdkModule.disconnectDevice();

// Scale commands
AiLinkSdkModule.sendWorkMode(1);           // WorkMode.HEIGHT_BODY_FAT
AiLinkSdkModule.sendUserData(1, 28, 175);  // gender, age, heightCm
AiLinkSdkModule.sendWeighingCompleted();

// iOS: both units together
AiLinkSdkModule.setUnit(0, 0);             // weightUnit=kg, heightUnit=cm
// Android: set separately
AiLinkSdkModule.setWeightUnit(0);
AiLinkSdkModule.setHeightUnit(0);

// A6 utility commands (device must be connected)
AiLinkSdkModule.getBleVersion();
AiLinkSdkModule.getBleName();
AiLinkSdkModule.setBleName('MyScale');
AiLinkSdkModule.getSupportUnit();

// Listen to native events
const sub = AiLinkSdkModule.addListener('onWeightData', (e) => {
  console.log(e.weight, e.point, e.stable);
});
sub.remove();
```

**Events emitted by the native module**

| Event | Payload | Description |
|---|---|---|
| `onStartScan` | `{ isScanning: boolean }` | Scan started. |
| `onDeviceFound` | `BleDevice` | A new device was found. |
| `onScanTimeOut` | `{ isScanning: boolean }` | Scan timed out. |
| `onScanError` | `ScanErrorEvent` | Scan error. `type`: 1=too frequent, 2=failed×3, 3=hw/permission, -1=prereq. |
| `onBleStateChange` | `{ state: 'on' \| 'off' }` | BLE adapter toggled. |
| `onConnecting` | `{ mac: string }` | Connection attempt started. |
| `onConnected` | `{ mac: string; name: string }` | Connection established. |
| `onDisconnected` | `{ mac: string; code: number }` | Disconnected. `code`: -1=timeout, 0=app, 19=device off, 133=BLE error. |
| `onNotifyData` | `NotifyDataEvent` | Raw A7 (MCU) notification bytes. |
| `onNotifyDataA6` | `NotifyDataA6Event` | Raw A6 (BLE module) notification bytes. |
| `onRequestUserData` | `{}` | Scale requests user profile. |
| `onWeightData` | `WeightDataEvent` | Weight update. |
| `onAdcData` | `AdcDataEvent` | Impedance measurement state change. |
| `onBodyFatData` | `BodyFatDataEvent` | Pre-calculated body composition from MCU. |
| `onHeightData` | `HeightDataEvent` | Height measurement. |
| `onScaleError` | `ScaleErrorEvent` | Scale error (`code: 1` = overweight). |

---

## Types reference

```ts
// ── User input ────────────────────────────────────────────────────────────────

type UserProfile = {
  gender: 1 | 2;    // 1 = Male, 2 = Female
  age: number;       // 1–120 years
  heightCm: number;  // 50–269 cm
};

// ── Measurement output ────────────────────────────────────────────────────────

type WeightReading = {
  isStable: boolean;   // true = final locked weight
  rawValue: number;    // integer from device
  point: number;       // decimal places; value = rawValue / 10^point
  value: number;       // convenience: rawValue / 10^point
  unit: number;        // see WeightUnit constants
};

type HeightReading = {
  rawValue: number;
  point: number;
  value: number;       // rawValue / 10^point
  unit: number;        // see HeightUnit constants
};

type AdcReading = {
  state: number;        // 0=measuring, 1=success(app algo), 2=failed, 3=success(MCU algo), 4=over
  aisle: number;        // 0=both feet, 1=both hands, …
  adcValue: number;
  algorithmId: number;
  isSuccess: boolean;   // true when state is 1 or 3 (ADC ready for body-fat algo)
};

type BodyComposition = {
  bodyFatRate: number;          // % body fat
  subcutaneousFatRate: number;  // % subcutaneous fat
  visceralFatIndex: number;     // integer 1–20+
  muscleRate: number;           // % muscle
  bmr: number;                  // basal metabolic rate (kcal)
  physicalAge: number;          // body age (years)
  boneMass: number;             // % bone mass
  bodyWater: number;            // % body water
  proteinRate: number;          // % protein
  bmi: number;                  // body mass index
  heartRate: number;            // bpm
  obesityGrade: number;         // 0=thin, 1=healthy, 2=obese, 3=exceed
};

type MeasurementSession = {
  finalWeight?:    WeightReading;
  finalHeight?:    HeightReading;
  adcReading?:     AdcReading;
  bodyComposition?: BodyComposition;
};

type ScaleErrorEvent = {
  code: number;  // 1 = overweight
};

type BleDevice = {
  mac: string;
  name: string;
  rssi: number;
};
```

---

## Measurement lifecycle

```
1. init()              — initialise native SDK

2. startScan()         — discover devices
   onDeviceFound       — BleDevice[] populated

3. connect(mac)        — stop scan, connect
   onConnected         — phase → 'connected'

4. setWorkMode()       — configure measurement type (BEFORE step on scale)

5. ── User steps on scale ──

6. onWeightData        — liveWeight streaming (isStable: false)
   onWeightData        — liveWeight locked   (isStable: true) → phase → 'measuring'

7. onHeightData        — heightReading set (HEIGHT_BODY_FAT / WEIGHT_HEIGHT modes)

8. onAdcData           — adcReading streaming
   onAdcData (state=3) — MCU body fat algo running

9. onBodyFatData       — bodyComposition set → phase → 'done'

10. completeWeighing() — signal session end to scale
    resetMeasurement() — clear state, return to 'connected' for next user

11. disconnect()       — all measurement state cleared, phase → 'idle'
```

---

## Constants

```ts
import { WorkMode, WeightUnit, HeightUnit } from 'ai-link-sdk';

// Work modes — pass to setWorkMode()
WorkMode.HEIGHT_BODY_FAT  // 1  Full: height + weight + body fat (default)
WorkMode.BABY             // 2  Baby weighing (hold infant)
WorkMode.WEIGHT           // 3  Weight + body fat only (no height sensor)
WorkMode.WEIGHT_HEIGHT    // 4  Weight + height, no impedance

// Weight units — pass to setUnits(weightUnit, heightUnit)
WeightUnit.KG   // 0
WeightUnit.JIN  // 1
WeightUnit.LB   // 6

// Height units
HeightUnit.CM   // 0
HeightUnit.INCH // 1
HeightUnit.FT   // 2
```

---

## Project structure

```
ai-link-sdk/
├── package.json               Peer dependencies and scripts
├── expo-module.config.json    Autolinking + plugin registration
├── index.ts                   Public API barrel
│
├── plugin/
│   └── index.ts               Expo config plugin (Android manifest)
│
├── src/
│   ├── AiLinkSdk.types.ts     All native event and shared types
│   ├── AiLinkSdkModule.ts     Raw native module declaration
│   ├── HeightBodyFatScale.ts  Imperative class wrapping the module
│   │
│   ├── hooks/                 React hooks (require <ScaleProvider>)
│   │   ├── ScaleContext.tsx   Provider — all shared state lives here
│   │   ├── useScaleSetup.ts
│   │   ├── useScaleScan.ts
│   │   ├── useScaleConnection.ts
│   │   ├── useScaleProfile.ts
│   │   ├── useScaleCommands.ts
│   │   ├── useScaleMeasurement.ts
│   │   └── index.ts
│   │
│   └── store/
│       └── bleStore.ts        Zustand + MMKV connection persistence
│
├── ios/
│   ├── AiLinkSdk.podspec
│   ├── AiLinkSdkModule.swift
│   └── Framework/
│       └── AILinkBleSDK.framework   (vendored — not in git)
│
└── android/
    ├── build.gradle
    └── src/main/
        ├── AndroidManifest.xml      (service declaration)
        └── java/expo/modules/ailinksdk/
            └── AiLinkSdkModule.kt
```

---

## License

MIT
