import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { LiquidGlass, LiquidGlassPill } from './LiquidGlass';

export interface HeaderProps {
  title?: string;
  showDropdownIndicator?: boolean;
  showBackButton?: boolean;
  onHistoryPress?: () => void;
  onPress?: () => void;
  isScrolled?: boolean;
}

const SvgChatHistory = ({ size = 22, color = '#1C1C1E' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="5" width="18" height="2" rx="1" fill={color} />
    <Rect x="3" y="11" width="14" height="2" rx="1" fill={color} />
    <Rect x="3" y="17" width="10" height="2" rx="1" fill={color} />
  </Svg>
);

const SvgChevronDown = ({ size = 14, color = '#636366' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgNewChat = ({ size = 20, color = '#1C1C1E' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const Header: React.FC<HeaderProps> = ({
  title = 'Candle',
  showDropdownIndicator = true,
  onHistoryPress,
  onPress,
  isScrolled = false,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { top: insets.top + 10 }]} pointerEvents="box-none">
      <TouchableOpacity
        onPress={onHistoryPress}
        activeOpacity={0.72}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Chat history"
      >
        <LiquidGlass
          variant="pill"
          intensity={isScrolled ? 70 : 62}
          borderRadius={21}
          style={styles.iconGlass}
          contentStyle={styles.iconContent}
        >
          <SvgChatHistory size={20} />
        </LiquidGlass>
      </TouchableOpacity>

      <TouchableOpacity onPress={onPress} activeOpacity={0.76}>
        <LiquidGlassPill
          intensity={isScrolled ? 72 : 62}
          style={styles.titleGlass}
          contentStyle={styles.titleContent}
        >
          <Text style={styles.titleText}>{title}</Text>
          {showDropdownIndicator ? <SvgChevronDown size={14} /> : null}
        </LiquidGlassPill>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.72}
        accessible
        accessibilityRole="button"
        accessibilityLabel="New chat"
      >
        <LiquidGlass
          variant="pill"
          intensity={isScrolled ? 70 : 62}
          borderRadius={21}
          style={styles.iconGlass}
          contentStyle={styles.iconContent}
        >
          <SvgNewChat size={18} />
        </LiquidGlass>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconGlass: {
    width: 42,
    height: 42,
  },
  iconContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGlass: {
    minWidth: 132,
  },
  titleContent: {
    minHeight: 42,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  titleText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0,
  },
});
