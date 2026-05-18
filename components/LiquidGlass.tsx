import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

export type LiquidGlassVariant = 'regular' | 'thin' | 'thick' | 'pill';

export interface LiquidGlassProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  variant?: LiquidGlassVariant;
  intensity?: number;
  borderRadius?: number;
  specularHighlight?: boolean;
  chromaticEdge?: boolean;
  causticShimmer?: boolean;
  dark?: boolean;
  animated?: boolean;
}

const VARIANT_CONFIG = {
  regular: {
    intensity: 66,
    background: 'rgba(251,252,255,0.68)',
    fallback: 'rgba(251,252,255,0.92)',
    border: 'rgba(255,255,255,0.86)',
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowY: 10,
  },
  thin: {
    intensity: 52,
    background: 'rgba(252,253,255,0.54)',
    fallback: 'rgba(252,253,255,0.86)',
    border: 'rgba(255,255,255,0.72)',
    shadowOpacity: 0.045,
    shadowRadius: 16,
    shadowY: 7,
  },
  thick: {
    intensity: 78,
    background: 'rgba(250,251,254,0.76)',
    fallback: 'rgba(250,251,254,0.96)',
    border: 'rgba(255,255,255,0.9)',
    shadowOpacity: 0.085,
    shadowRadius: 26,
    shadowY: 12,
  },
  pill: {
    intensity: 62,
    background: 'rgba(251,252,255,0.7)',
    fallback: 'rgba(251,252,255,0.94)',
    border: 'rgba(255,255,255,0.86)',
    shadowOpacity: 0.065,
    shadowRadius: 18,
    shadowY: 8,
  },
};

export const LiquidGlassFilterDefs = () => null;

function webMaterialStyle(
  borderRadius: number,
  variant: LiquidGlassVariant,
  dark: boolean
): StyleProp<ViewStyle> {
  if (Platform.OS !== 'web') return undefined;
  const config = VARIANT_CONFIG[variant];

  return {
    borderRadius,
    backgroundColor: dark ? 'rgba(28,30,36,0.72)' : config.background,
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,255,255,0.2)' : config.border,
    boxShadow: dark
      ? `0 ${config.shadowY}px ${config.shadowRadius}px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.16)`
      : `0 ${config.shadowY}px ${config.shadowRadius}px rgba(28,34,45,${config.shadowOpacity}), inset 0 1px 0 rgba(255,255,255,0.88)`,
    backdropFilter: 'blur(18px) saturate(1.12)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.12)',
  } as ViewStyle;
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  style,
  contentStyle,
  variant = 'regular',
  intensity,
  borderRadius = 24,
  specularHighlight = true,
  dark = false,
}) => {
  const config = VARIANT_CONFIG[variant];
  const blurIntensity = intensity ?? config.intensity;
  const nativeShadow = Platform.OS === 'web' ? undefined : {
    shadowColor: dark ? '#05070A' : '#1F2937',
    shadowOffset: { width: 0, height: config.shadowY },
    shadowOpacity: config.shadowOpacity,
    shadowRadius: config.shadowRadius,
    elevation: variant === 'thin' ? 2 : 4,
  };

  return (
    <View
      style={[
        styles.root,
        nativeShadow,
        { borderRadius },
        webMaterialStyle(borderRadius, variant, dark),
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          tint={dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
          intensity={blurIntensity}
          style={StyleSheet.absoluteFill}
        />
      ) : Platform.OS !== 'web' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: dark ? 'rgba(28,30,36,0.72)' : config.fallback },
          ]}
        />
      ) : null}

      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: dark ? 'rgba(255,255,255,0.035)' : config.background,
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: 1,
            borderColor: dark ? 'rgba(255,255,255,0.18)' : config.border,
          },
        ]}
      />

      {specularHighlight ? (
        <LinearGradient
          pointerEvents="none"
          colors={[
            dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)',
            dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.22)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.32, 0.72]}
          start={{ x: 0.18, y: 0 }}
          end={{ x: 0.82, y: 1 }}
          style={[styles.topHighlight, { borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }]}
        />
      ) : null}

      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

export const LiquidGlassCard: React.FC<LiquidGlassProps> = (props) => (
  <LiquidGlass variant="regular" {...props} />
);

export const LiquidGlassPill: React.FC<LiquidGlassProps> = ({
  borderRadius = 999,
  variant = 'pill',
  ...props
}) => (
  <LiquidGlass borderRadius={borderRadius} variant={variant} {...props} />
);

export const LiquidGlassButton: React.FC<
  LiquidGlassProps & { onPress?: () => void; disabled?: boolean }
> = ({ onPress, disabled, children, style, contentStyle, ...props }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.76} style={style}>
    <LiquidGlass
      variant="pill"
      borderRadius={20}
      contentStyle={[styles.buttonContent, contentStyle]}
      {...props}
    >
      {children}
    </LiquidGlass>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    position: 'relative',
    zIndex: 2,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '44%',
  },
  buttonContent: {
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
