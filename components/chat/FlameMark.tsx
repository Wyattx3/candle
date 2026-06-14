/**
 * FlameMark — a flame glyph inside a rounded flame-fill tile. Used as the hero
 * mark on Home and (small variant) as the agent avatar in the chat stream.
 */
import { View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Candle } from '@/constants/theme';

interface FlameMarkProps {
  /** Outer tile size (square). */
  size?: number;
  /** Tile corner radius. */
  radius?: number;
  /** Glyph color. */
  glyphColor?: string;
  /** Tile fill color. */
  fill?: string;
  /** Whether to render the flame-deep drop shadow. */
  shadow?: boolean;
  style?: ViewStyle;
}

/** A simple, self-contained flame path drawn on a 24x24 viewBox. */
function FlameGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2c.6 2.6-.9 4.2-2.3 5.6C8.2 9 6.8 10.5 6.8 13.2 6.8 17 9.5 20 12.5 20c3 0 5.2-2.3 5.2-5.4 0-2-.9-3.6-1.9-4.9-.4 1-1.1 1.7-2 2 .6-1.9.2-4-1-5.6C11.7 4.3 11.5 3 12 2z"
        fill={color}
      />
    </Svg>
  );
}

export function FlameMark({
  size = 54,
  radius = 17,
  glyphColor = Candle.textOnInk,
  fill = Candle.flame,
  shadow = false,
  style,
}: FlameMarkProps) {
  const glyphSize = Math.round(size * 0.52);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadow
          ? {
              shadowColor: Candle.flameDeep,
              shadowOpacity: 0.45,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }
          : null,
        style,
      ]}
    >
      <FlameGlyph size={glyphSize} color={glyphColor} />
    </View>
  );
}
