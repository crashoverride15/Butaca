import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Floor test: every colour token of spec §4.1 exists with its exact value.

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

const SPEC_COLORS: Record<string, string> = {
  '--bg': '#0B0D12',
  '--surface': '#151922',
  '--surface-2': '#1E2430',
  '--surface-3': '#2B3240',
  '--line': '#232937',
  '--line-soft': '#1E2430',
  '--line-strong': '#2B3240',
  '--line-control': '#3A4352',
  '--line-dashed': '#4A5363',
  '--text': '#F2F3F5',
  '--text-2': '#E9ECF1',
  '--text-soft': '#C5CBD6',
  '--muted': '#98A1B0',
  '--accent': '#E5484D',
  '--accent-soft': '#2A1418',
  '--accent-text': '#FF6B70',
  '--accent-light': '#FF8A8E',
  '--gold': '#F5B544',
  '--rt': '#F25C3C',
  '--warm-eyebrow': '#F4B26A',
  '--overlay-pill': 'rgba(11, 13, 18, 0.70)',
  '--overlay-glass': 'rgba(11, 13, 18, 0.55)',
  '--nav-glass': 'rgba(21, 25, 34, 0.88)',
  '--prime': '#4FA3E0',
  '--disney': '#5B7CFA',
  '--hbo': '#A66BFA',
  '--platform-other': '#98A1B0',
};

function tokenValue(name: string): string | undefined {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match?.[1].trim();
}

describe('design tokens', () => {
  it.each(Object.entries(SPEC_COLORS))('%s is %s', (name, value) => {
    expect(tokenValue(name)).toBe(value);
  });

  it.each(['--t-hero', '--t-title-xl', '--t-screen', '--t-greeting', '--t-card-xl', '--t-section', '--t-body', '--t-eyebrow'])(
    '%s typography token exists',
    (name) => {
      expect(tokenValue(name)).toBeDefined();
    },
  );
});
