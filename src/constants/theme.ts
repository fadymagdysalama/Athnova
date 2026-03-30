export const colors = {
  // Core
  background: '#ECEEF2',
  surface: '#F8F9FB',
  surfaceLight: '#ECEEF2',
  card: '#FFFFFF',
  cardHover: '#F4F5F7',

  // Brand
  primary: '#1E3A8A',
  primaryLight: '#2563EB',
  primaryDark: '#1E2F6B',

  // Accent
  accent: '#0891B2',
  success: '#15803D',
  warning: '#B45309',
  error: '#B91C1C',

  // Text
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textInverse: '#FFFFFF',

  // Borders
  border: '#CBD5E1',
  borderLight: '#E2E8F0',

  // Overlay
  overlay: 'rgba(15, 23, 42, 0.5)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;
