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
  },
  plugins: ['expo-router'],
};

export default config;
