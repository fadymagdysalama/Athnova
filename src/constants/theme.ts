export const colors = {
  // Core backgrounds
  background: '#EBF0FA',
  surface: '#FFFFFF',
  surfaceLight: '#DDE6F5',
  card: '#FFFFFF',
  cardHover: '#F0F5FF',

  // Brand — deep royal navy (original Coachera blue)
  primary: '#1E3A8A',
  primaryLight: '#2D52B8',
  primaryDark: '#152B6B',

  // Accent — vibrant mid-blue (same family as primary)
  accent: '#3B82F6',
  accentLight: '#60A5FA',
  accentFaded: 'rgba(59, 130, 246, 0.12)',

  // Semantic
  success: '#059669',
  successFaded: 'rgba(5, 150, 105, 0.12)',
  warning: '#D97706',
  warningFaded: 'rgba(217, 119, 6, 0.12)',
  error: '#DC2626',
  errorFaded: 'rgba(220, 38, 38, 0.12)',

  // Text
  text: '#0F172A',
  textSecondary: '#1E3A5F',
  textMuted: '#4D6A8A',
  textInverse: '#FFFFFF',

  // Borders
  border: '#BFCFE8',
  borderLight: '#D4E2F4',

  // Overlay
  overlay: 'rgba(15, 23, 42, 0.65)',
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
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const borderRadius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
