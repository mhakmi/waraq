import Storage from 'expo-sqlite/kv-store';
import { useState } from 'react';
import { Appearance } from 'react-native';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const themeChoices: ThemeChoice[] = ['system', 'light', 'dark'];

const themeKey = 'theme';

function savedChoice(): ThemeChoice {
  const saved = Storage.getItemSync(themeKey);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

function apply(choice: ThemeChoice) {
  Appearance.setColorScheme(choice === 'system' ? 'auto' : choice);
}

export function applySavedTheme() {
  apply(savedChoice());
}

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState(savedChoice);
  function choose(next: ThemeChoice) {
    Storage.setItemSync(themeKey, next);
    apply(next);
    setChoice(next);
  }
  return [choice, choose];
}
