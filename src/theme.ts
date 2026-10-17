import { useColorScheme } from 'react-native';

const light = {
  surface: '#f7f3ec',
  surfaceRaised: '#fffdf8',
  surfaceSunken: '#ede7dc',
  ink: '#1c2230',
  inkMuted: '#545b69',
  line: '#d9d1c3',
  accent: '#1f3b6e',
  onAccent: '#ffffff',
  accentSoft: '#dde5f2',
  onAccentSoft: '#1f3b6e',
  danger: '#9c2f28',
  dangerSoft: '#f5dfdb',
  success: '#2c6542',
  successSoft: '#dcebdf',
  warning: '#7d5200',
  warningSoft: '#f4e6c6',
  paper: '#ffffff',
};

export type Colors = typeof light;

const dark: Colors = {
  surface: '#14171d',
  surfaceRaised: '#1c2028',
  surfaceSunken: '#262b35',
  ink: '#ece8e0',
  inkMuted: '#a8adb7',
  line: '#343a47',
  accent: '#a9c1ec',
  onAccent: '#0f1e38',
  accentSoft: '#243656',
  onAccentSoft: '#cddbf5',
  danger: '#f0a39b',
  dangerSoft: '#45231f',
  success: '#98d0a8',
  successSoft: '#1d3527',
  warning: '#e8c47a',
  warningSoft: '#3c3018',
  paper: '#e6e2da',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

export const touchTarget = 48;
export const radius = 14;
