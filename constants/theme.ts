/**
 * Candle Design Tokens
 * ---------------------------------------------------------------------------
 * Warm-cream design language sourced from the Pencil design file (candle.pen).
 * Cards blend into the canvas with hairline borders (not white raised cards),
 * flame-orange accent, Inter typography. These are the source-of-truth color
 * tokens for the Candle UI and are mirrored into tailwind.config.js so the
 * matching NativeWind utility classes (bg-canvas, text-primary, flame, …) are
 * available across the app.
 */
export const Candle = {
  // Accent / flame
  accent: '#FF9500',
  accentSoft: '#FF95001F',
  flame: '#FF9500',
  flameCore: '#FFB340',
  flameDeep: '#EA6C0A',
  ember: '#FF5E3A',

  // Backgrounds / surfaces
  bgCanvas: '#FBF6EF',
  bgElevated: '#FFFDFA',
  bgWarmDeep: '#F3EBDE',
  surfaceSunken: '#F2EADD',

  // Ink / text
  ink: '#2A201A',
  textPrimary: '#2A201A',
  textSecondary: '#7D7066',
  textTertiary: '#A89C8E',
  textOnAccent: '#FFFFFF',
  textOnInk: '#FFFDF8',

  // Lines / glass
  hairline: '#2A201A17',
  glassBorder: '#FFFFFFDE',
  glassRegular: '#FFFDF8C7',
  glassThick: '#FFFCF5D9',
  glassThin: '#FFFDF89C',

  // Status
  success: '#3E9D5B',
  successSoft: '#3E9D5B1F',
  warning: '#C77400',
  warningSoft: '#E8930026',
  danger: '#C0341D',
  dangerSoft: '#C0341D1F',

  // Terminal
  terminalBg: '#241B14',
  terminalText: '#FFB340',
} as const;

export type CandleColorToken = keyof typeof Candle;

/** Font families used across the Candle design (see candle.pen). */
export const CandleFonts = {
  body: 'Inter',
  display: 'Inter',
  mono: 'Geist Mono',
} as const;

/**
 * Weight-specific font family names registered in `app/_layout.tsx` via
 * `useFonts`. React Native does not synthesize weights for custom fonts, so
 * for crisp bold/medium text prefer an explicit family here over relying on
 * `fontWeight` alone. `interForWeight` maps a numeric/string weight to the
 * closest loaded Inter face.
 */
export const CandleFontFamilies = {
  inter: 'Inter',
  interMedium: 'Inter-Medium',
  interSemiBold: 'Inter-SemiBold',
  interBold: 'Inter-Bold',
  mono: 'Geist Mono',
  monoMedium: 'Geist Mono-Medium',
} as const;

export function interForWeight(weight?: string | number): string {
  const w = typeof weight === 'string' ? parseInt(weight, 10) : weight ?? 400;
  if (w >= 700) return CandleFontFamilies.interBold;
  if (w >= 600) return CandleFontFamilies.interSemiBold;
  if (w >= 500) return CandleFontFamilies.interMedium;
  return CandleFontFamilies.inter;
}
