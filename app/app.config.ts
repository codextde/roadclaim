import { type ConfigContext, type ExpoConfig } from 'expo/config';
import { AndroidConfig, withAndroidManifest } from 'expo/config-plugins';

const LEGACY_STORAGE = 'android.permission.WRITE_EXTERNAL_STORAGE';

// Libraries may request WRITE_EXTERNAL_STORAGE; it is only needed to save photos on Android 9 and older.
const withLegacyStorageOnly = (config: ExpoConfig) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    const permissions = (manifest['uses-permission'] ?? []).filter((p) => p.$['android:name'] !== LEGACY_STORAGE);
    permissions.push({ $: { 'android:name': LEGACY_STORAGE, 'android:maxSdkVersion': '28', 'tools:replace': 'android:maxSdkVersion' } as AndroidConfig.Manifest.ManifestUsesPermission['$'] });
    manifest['uses-permission'] = permissions;
    return mod;
  });

export default ({ config }: ConfigContext): ExpoConfig =>
  withLegacyStorageOnly({
    ...(config as ExpoConfig),
    plugins: (config.plugins ?? []).map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'react-native-maps'
        ? ['react-native-maps', { ...plugin[1], androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' }]
        : plugin,
    ),
  });
