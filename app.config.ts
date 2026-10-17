import type { ExpoConfig } from 'expo/config';

import brand from './src/brand.json';

const config: ExpoConfig = {
  name: brand.displayName,
  slug: brand.slug,
  scheme: brand.slug,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  android: {
    package: brand.androidPackage,
    allowBackup: false,
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
    ],
  },
  plugins: ['expo-router', './plugins/network-security.ts'],
};

export default config;
