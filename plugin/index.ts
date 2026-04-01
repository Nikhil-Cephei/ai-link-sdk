/**
 * withAiLinkSdk — Expo config plugin for the ai-link-sdk module.
 *
 * Automatically patches the Android manifest with all BLE permissions,
 * hardware features, and the AILink background service declaration needed
 * by the AILinkBleManager SDK.
 *
 * Add to app.config.ts:
 * ```ts
 * plugins: [
 *   ["./modules/ai-link-sdk/plugin", { backgroundLocation: false }]
 * ]
 * ```
 *
 * When published as an npm package, Expo picks this up automatically
 * via the "plugin" field in expo-module.config.json.
 */
import {
  type AndroidManifest,
  type ConfigPlugin,
  createRunOncePlugin,
  withAndroidManifest,
} from 'expo/config-plugins';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiLinkSdkPluginProps {
  /**
   * Add ACCESS_BACKGROUND_LOCATION to the manifest.
   * Required only if your app scans for BLE devices while backgrounded
   * (e.g. via a foreground service). Adds Play Store review friction.
   * @default false
   */
  backgroundLocation?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addPermission(
  manifest: AndroidManifest['manifest'],
  name: string,
  extraAttrs: Record<string, string> = {},
): void {
  if (!manifest['uses-permission']) manifest['uses-permission'] = [];
  const already = manifest['uses-permission'].some(
    (p) => p.$?.['android:name'] === name,
  );
  if (!already) {
    manifest['uses-permission'].push({ $: { 'android:name': name, ...extraAttrs } });
  }
}

function addFeature(
  manifest: AndroidManifest['manifest'],
  name: string,
  required = false,
): void {
  if (!manifest['uses-feature']) manifest['uses-feature'] = [];
  const already = manifest['uses-feature'].some(
    (f) => f.$?.['android:name'] === name,
  );
  if (!already) {
    manifest['uses-feature'].push({
      $: { 'android:name': name, 'android:required': String(required) },
    });
  }
}

// ── Core modifier ─────────────────────────────────────────────────────────────

function applyAndroidManifest(
  manifest: AndroidManifest['manifest'],
  { backgroundLocation = false }: AiLinkSdkPluginProps,
): void {
  // Ensure the tools namespace is declared (needed for tools:remove / tools:targetApi).
  if (!manifest.$) manifest.$ = {};
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }

  // ── Location ──────────────────────────────────────────────────────────────
  // tools:remove strips any maxSdkVersion injected by react-native-permissions.
  addPermission(manifest, 'android.permission.ACCESS_FINE_LOCATION', {
    'tools:remove': 'android:maxSdkVersion',
  });
  addPermission(manifest, 'android.permission.ACCESS_COARSE_LOCATION', {
    'tools:remove': 'android:maxSdkVersion',
  });

  if (backgroundLocation) {
    // Required for background BLE scanning on Android 10+.
    addPermission(manifest, 'android.permission.ACCESS_BACKGROUND_LOCATION');
  }

  // ── Legacy Bluetooth (API ≤ 30) ───────────────────────────────────────────
  addPermission(manifest, 'android.permission.BLUETOOTH', {
    'android:maxSdkVersion': '30',
  });
  addPermission(manifest, 'android.permission.BLUETOOTH_ADMIN', {
    'android:maxSdkVersion': '30',
  });

  // ── Android 12+ Bluetooth (API ≥ 31) ─────────────────────────────────────
  addPermission(manifest, 'android.permission.BLUETOOTH_SCAN', {
    'android:usesPermissionFlags': 'neverForLocation',
    'tools:targetApi': 's',
  });
  addPermission(manifest, 'android.permission.BLUETOOTH_CONNECT');
  addPermission(manifest, 'android.permission.BLUETOOTH_ADVERTISE');

  // ── Foreground service type (required for connectedDevice scanning) ───────
  addPermission(
    manifest,
    'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  );

  // ── Hardware features (not strictly required — avoids filtering on stores) ─
  addFeature(manifest, 'android.hardware.bluetooth_le', false);
  addFeature(manifest, 'android.hardware.bluetooth', false);
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const withAiLinkSdkAndroid: ConfigPlugin<AiLinkSdkPluginProps> = (
  config,
  props = {},
) =>
  withAndroidManifest(config, (c) => {
    applyAndroidManifest(c.modResults.manifest, props);
    return c;
  });

/**
 * withAiLinkSdk
 *
 * Applies all Android manifest changes required by the ai-link-sdk module.
 * Wrapped in createRunOncePlugin so it is safe to include multiple times.
 */
const withAiLinkSdk = createRunOncePlugin<AiLinkSdkPluginProps>(
  withAiLinkSdkAndroid,
  'ai-link-sdk',
  '0.7.9',
);

export default withAiLinkSdk;
