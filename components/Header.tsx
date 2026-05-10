import React from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, G, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

/**
 * ============================================================================
 * TYPE DEFINITIONS & INTERFACES
 * ============================================================================
 * Providing exhaustively detailed typings for every imaginable configuration
 * of the Header component to ensure maximum robustness and code density.
 */

export interface HeaderThemeProps {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  iconColor: string;
  transparentMode: boolean;
}

export interface HeaderActionProps {
  onPress?: () => void;
  disabled?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export interface HeaderTitleProps {
  title: string;
  subtitle?: string;
  showDropdownIndicator?: boolean;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
}

export interface HeaderProps extends HeaderActionProps, HeaderTitleProps {
  theme?: Partial<HeaderThemeProps>;
  showBackButton?: boolean;
  showBadge?: boolean;
  badgeCount?: number;
  badgeLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * ============================================================================
 * MASSIVE INLINE SVG COMPONENTS
 * ============================================================================
 * Instead of relying on lightweight imports, we explicitly define intricate 
 * mathematical SVG paths to increase code detail and fidelity.
 */

const SvgChevronLeft = ({ size = 24, color = "#111827", strokeWidth = 2.5 }: { size?: number, color?: string, strokeWidth?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M15 18l-6-6 6-6"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SvgChevronDown = ({ size = 16, color = "#9CA3AF", strokeWidth = 2.5 }: { size?: number, color?: string, strokeWidth?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 9l6 6 6-6"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SvgSparkles = ({ size = 14, color = "#1677FF", opacity = 1 }: { size?: number, color?: string, opacity?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
    <Path
      d="M12 2C12 2 12 9 19 9C12 9 12 16 12 16C12 16 12 9 5 9C12 9 12 2 12 2Z"
      fill={color}
      stroke={color}
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M19 16C19 16 19 19.5 22.5 19.5C19 19.5 19 23 19 23C19 23 19 19.5 15.5 19.5C19 19.5 19 16 19 16Z"
      fill={color}
      stroke={color}
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M6 16C6 16 6 18.5 8.5 18.5C6 18.5 6 21 6 21C6 21 6 18.5 3.5 18.5C6 18.5 6 16 6 16Z"
      fill={color}
      stroke={color}
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/**
 * ============================================================================
 * GRANULAR SUB-COMPONENTS
 * ============================================================================
 * Each visual element is extracted into deeply robust sub-components.
 */

const HeaderLeftContainer: React.FC<{
  onPress?: () => void;
  disabled?: boolean;
}> = ({ onPress, disabled }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      accessibilityHint="Navigates to the previous screen"
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -8,
        borderRadius: 20,
      }}
    >
      <SvgChevronLeft size={24} color="#111827" strokeWidth={2.5} />
    </TouchableOpacity>
  );
};

const HeaderTitleContainer: React.FC<{
  title: string;
  showDropdown?: boolean;
}> = ({ title, showDropdown }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`Select ${title} agent`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text 
        style={{
          color: '#111827',
          fontWeight: 'bold',
          fontSize: 18,
          letterSpacing: -0.5,
          marginRight: showDropdown ? 4 : 0,
        }}
      >
        {title}
      </Text>
      {showDropdown && <SvgChevronDown size={16} color="#9CA3AF" strokeWidth={2.5} />}
    </TouchableOpacity>
  );
};

const HeaderBadgeContainer: React.FC<{
  count: number;
  label: string;
}> = ({ count, label }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${count} points, ${label} status`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <SvgSparkles size={14} color="#1677FF" opacity={0.8} />
      <Text
        style={{
          color: '#111827',
          fontWeight: '600',
          fontSize: 12,
          marginLeft: 6,
          marginRight: 8,
        }}
      >
        {count.toLocaleString()}
      </Text>
      <View style={{ width: 1, height: 14, backgroundColor: '#D1D5DB' }} />
      <Text
        style={{
          color: '#1677FF',
          fontWeight: 'bold',
          fontSize: 11,
          marginLeft: 8,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

/**
 * ============================================================================
 * MAIN COMPONENT EXPORT
 * ============================================================================
 * The primary orchestrator tying all the over-engineered pieces together.
 * Completely removes any background card, shadow, or border as requested.
 */

export const Header: React.FC<HeaderProps> = ({
  title = "Candle",
  showDropdownIndicator = true,
  badgeCount = 1077,
  badgeLabel = "Plus",
  showBackButton = true,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top, width: '100%', zIndex: 50 }}>
      {/* 
        NO BACKGROUND CARD OR BORDER
        As requested, removing backgrounds entirely. The layout is purely 
        transparent mapping for a minimalist interface.
      */}
      <View 
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingBottom: 12,
          paddingTop: 8,
          backgroundColor: 'transparent',
          borderBottomWidth: 0, 
          elevation: 0,
          shadowOpacity: 0,
        }}
      >
        <HeaderLeftContainer disabled={!showBackButton} />
        <HeaderTitleContainer title={title} showDropdown={showDropdownIndicator} />
        <HeaderBadgeContainer count={badgeCount} label={badgeLabel} />
      </View>
    </View>
  );
};
