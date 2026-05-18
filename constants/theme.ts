/**
 * Apple Liquid Glass Design System Colors
 * Based on Apple's iOS 26 Liquid Glass design language.
 * Translucent materials, system colors, and depth layering.
 */

import { Platform } from 'react-native';

const tintColorLight = '#007AFF';
const tintColorDark = '#0A84FF';

export const Colors = {
  light: {
    text: '#1C1C1E',
    secondaryText: '#3C3C43',
    tertiaryText: '#636366',
    quaternaryText: '#8E8E93',
    background: '#F5F5F7',
    secondaryBackground: '#FFFFFF',
    tertiaryBackground: 'rgba(255,255,255,0.7)',
    tint: tintColorLight,
    icon: '#636366',
    tabIconDefault: '#8E8E93',
    tabIconSelected: tintColorLight,
    separator: 'rgba(60,60,67,0.08)',
    glassBg: 'rgba(255,255,255,0.5)',
    glassBorder: 'rgba(255,255,255,0.4)',
    glassHighlight: 'rgba(255,255,255,0.7)',
  },
  dark: {
    text: '#F5F5F7',
    secondaryText: '#EBEBF5',
    tertiaryText: '#AEAEB2',
    quaternaryText: '#636366',
    background: '#000000',
    secondaryBackground: '#1C1C1E',
    tertiaryBackground: 'rgba(44,44,46,0.7)',
    tint: tintColorDark,
    icon: '#AEAEB2',
    tabIconDefault: '#636366',
    tabIconSelected: tintColorDark,
    separator: 'rgba(84,84,88,0.36)',
    glassBg: 'rgba(30,30,30,0.5)',
    glassBorder: 'rgba(255,255,255,0.1)',
    glassHighlight: 'rgba(255,255,255,0.12)',
  },
};

/**
 * Apple System Colors
 */
export const SystemColors = {
  blue: '#007AFF',
  green: '#34C759',
  indigo: '#5856D6',
  orange: '#FF9500',
  pink: '#FF2D55',
  purple: '#AF52DE',
  red: '#FF3B30',
  teal: '#5AC8FA',
  yellow: '#FFCC00',
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
