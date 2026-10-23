import { expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ useColorScheme: () => null }));

const { dark, light } = await import('./theme');
type Token = keyof typeof light;

function channel(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const textPairs: [Token, Token][] = [
  ['ink', 'surface'],
  ['ink', 'surfaceRaised'],
  ['ink', 'surfaceSunken'],
  ['ink', 'successSoft'],
  ['ink', 'warningSoft'],
  ['ink', 'dangerSoft'],
  ['inkMuted', 'surface'],
  ['inkMuted', 'surfaceRaised'],
  ['inkMuted', 'surfaceSunken'],
  ['accent', 'surface'],
  ['accent', 'surfaceRaised'],
  ['accent', 'successSoft'],
  ['onAccent', 'accent'],
  ['onAccentSoft', 'accentSoft'],
  ['danger', 'surface'],
  ['danger', 'surfaceRaised'],
  ['danger', 'dangerSoft'],
  ['success', 'surface'],
  ['success', 'surfaceRaised'],
  ['onSnackbar', 'snackbar'],
  ['snackbarAction', 'snackbar'],
];

const graphicPairs: [Token, Token][] = [
  ['accent', 'surface'],
  ['accent', 'surfaceRaised'],
  ['accent', 'surfaceSunken'],
  ['danger', 'surfaceRaised'],
  ['danger', 'dangerSoft'],
  ['success', 'successSoft'],
  ['warning', 'warningSoft'],
  ['inkMuted', 'surface'],
  ['inkMuted', 'surfaceRaised'],
  ['outline', 'surface'],
  ['outline', 'surfaceRaised'],
];

test('contrast: the formula gives 21 for black on white and 1 for a color on itself', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#1f3b6e', '#1f3b6e')).toBe(1);
});

for (const [name, colors] of [['light', light], ['dark', dark]] as const) {
  test.each(textPairs)(`contrast: ${name} text %s on %s is at least 4.5 to 1`, (foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
  });

  test.each(graphicPairs)(`contrast: ${name} icon or border %s on %s is at least 3 to 1`, (foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(3);
  });
}
