import type { ExpoConfig } from 'expo/config';

import brand from './src/brand.json';

const config: ExpoConfig = {
  name: brand.displayName,
  slug: brand.slug,
  scheme: brand.slug,
  version: '0.3.2',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon/launcher-192.png',
  android: {
    package: brand.androidPackage,
    versionCode: 5,
    adaptiveIcon: {
      foregroundImage: './assets/icon/adaptive-foreground-1024.png',
      monochromeImage: './assets/icon/adaptive-monochrome-1024.png',
      backgroundColor: '#1f3b6e',
    },
    allowBackup: false,
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.USE_BIOMETRIC',
      'android.permission.VIBRATE',
      'android.permission.USE_FINGERPRINT',
      // WorkManager declares it for its foreground service, which the upload task never uses.
      'android.permission.FOREGROUND_SERVICE',
    ],
    intentFilters: ['SEND', 'SEND_MULTIPLE'].map((action) => ({
      action,
      category: ['DEFAULT'],
      data: [{ mimeType: 'application/pdf' }, { mimeType: 'image/*' }],
    })),
  },
  extra: {
    crashTestScreen: process.env.WARAQ_CRASH_TEST === '1',
  },
  plugins: [
    'expo-router',
    'expo-background-task',
    './plugins/network-security.ts',
    './plugins/proguard-rules.ts',
    './plugins/release-build.ts',
  ],
};

export default config;
