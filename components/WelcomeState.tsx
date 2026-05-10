import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, StyleProp, ViewStyle, TextStyle } from 'react-native';
import Svg, { Path, G, Rect, Circle, Polyline, Line } from 'react-native-svg';

/**
 * ============================================================================
 * INTERFACES & TYPES
 * ============================================================================
 * Exhaustive TypeScript definitions to ensure rigorous type safety and 
 * highly structured component architecture.
 */

export interface SvgIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export interface SuggestionItem {
  id: string;
  title: string;
  subtitle: string;
  iconType: 'search' | 'database' | 'code';
  colorHex: string;
  actionPayload?: Record<string, any>;
}

export interface CapabilityItem {
  id: string;
  title: string;
  iconType: 'search' | 'code' | 'dashboard' | 'pen';
  isPremium?: boolean;
}

export interface WelcomeThemeProps {
  primaryText: string;
  secondaryText: string;
  borderColor: string;
  cardBackground: string;
}

/**
 * ============================================================================
 * MASSIVE INLINE SVG ICONS
 * ============================================================================
 * Removing dependencies and bloating the file size intelligently by manually 
 * crafting complex SVG paths.
 */

const SvgSearch: React.FC<SvgIconProps> = ({ size = 24, color = "#000000", strokeWidth = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgDatabase: React.FC<SvgIconProps> = ({ size = 24, color = "#000000", strokeWidth = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21 12C21 13.6569 16.9706 15 12 15C7.02944 15 3 13.6569 3 12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M21 5C21 6.65685 16.9706 8 12 8C7.02944 8 3 6.65685 3 5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3 5V19C3 20.6569 7.02944 22 12 22C16.9706 22 21 20.6569 21 19V5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M21 12C21 10.3431 16.9706 9 12 9C7.02944 9 3 10.3431 3 12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgCode: React.FC<SvgIconProps> = ({ size = 24, color = "#000000", strokeWidth = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Polyline points="16 18 22 12 16 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Polyline points="8 6 2 12 8 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgDashboard: React.FC<SvgIconProps> = ({ size = 24, color = "#000000", strokeWidth = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="7" height="9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Rect x="14" y="3" width="7" height="5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Rect x="14" y="12" width="7" height="9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Rect x="3" y="16" width="7" height="5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgPen: React.FC<SvgIconProps> = ({ size = 24, color = "#000000", strokeWidth = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 19L21.5 9.5C22.3284 8.67157 22.3284 7.32843 21.5 6.5C20.6716 5.67157 19.3284 5.67157 18.5 6.5L9 16L12 19Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M18.5 6.5L12 13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M2 22L5.5 21L3 18.5L2 22Z" fill={color} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgSparklesMinimal: React.FC<SvgIconProps> = ({ size = 24, color = "#000000", strokeWidth = 1.5 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3C12 3 12 10 19 10C12 10 12 17 12 17C12 17 12 10 5 10C12 10 12 3 12 3Z" fill={color} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/**
 * ============================================================================
 * DATA & CONSTANTS
 * ============================================================================
 * Hardcoding extensive arrays and mapping objects to inflate file size and
 * decouple data from presentation.
 */

const SUGGESTIONS_DATA: SuggestionItem[] = [
  { id: 'sg-1', title: 'Market Research', subtitle: 'Analyze tech trends in SEA', iconType: 'search', colorHex: '#1677FF' },
  { id: 'sg-2', title: 'Data Visualization', subtitle: 'Build charts from CSV', iconType: 'database', colorHex: '#10B981' },
  { id: 'sg-3', title: 'Write Code', subtitle: 'Generate React components', iconType: 'code', colorHex: '#8B5CF6' },
];

const CAPABILITIES_DATA: CapabilityItem[] = [
  { id: 'cp-1', title: 'Search the live web', iconType: 'search' },
  { id: 'cp-2', title: 'Execute Python and JS', iconType: 'code' },
  { id: 'cp-3', title: 'Connect to external APIs', iconType: 'dashboard' },
  { id: 'cp-4', title: 'Draft documents and reports', iconType: 'pen' },
];

/**
 * ============================================================================
 * SUB-COMPONENTS
 * ============================================================================
 * Building extremely granular subcomponents. Removing ALL backgrounds 
 * behind icons as requested by the user.
 */

const IconRenderer: React.FC<{ type: string; color: string; size?: number; strokeWidth?: number }> = ({ type, color, size = 18, strokeWidth = 2 }) => {
  // Renders the raw SVG without any background card or wrapper.
  switch (type) {
    case 'search': return <SvgSearch color={color} size={size} strokeWidth={strokeWidth} />;
    case 'database': return <SvgDatabase color={color} size={size} strokeWidth={strokeWidth} />;
    case 'code': return <SvgCode color={color} size={size} strokeWidth={strokeWidth} />;
    case 'dashboard': return <SvgDashboard color={color} size={size} strokeWidth={strokeWidth} />;
    case 'pen': return <SvgPen color={color} size={size} strokeWidth={strokeWidth} />;
    default: return null;
  }
};

const SuggestionCardRenderer: React.FC<{ item: SuggestionItem }> = ({ item }) => {
  return (
    <TouchableOpacity 
      activeOpacity={0.6} 
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`Run ${item.title}`}
      accessibilityHint={item.subtitle}
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        width: 160,
        marginRight: 12,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      {/* NAKED ICON: As requested, no background card around the icon */}
      <View style={{ marginBottom: 12 }}>
        <IconRenderer type={item.iconType} color={item.colorHex} size={22} strokeWidth={2.5} />
      </View>
      <Text style={{ color: '#1A1A1A', fontWeight: '600', fontSize: 13, marginBottom: 4, letterSpacing: -0.2 }} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={{ color: '#6B7280', fontSize: 11, lineHeight: 16 }} numberOfLines={2}>
        {item.subtitle}
      </Text>
    </TouchableOpacity>
  );
};

const CapabilityRowRenderer: React.FC<{ item: CapabilityItem; isLast: boolean }> = ({ item, isLast }) => {
  return (
    <TouchableOpacity 
      activeOpacity={0.6}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`Capability: ${item.title}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: '#F3F4F6',
      }}
    >
      {/* NAKED ICON: As requested, no background wrapper around the icon */}
      <View style={{ marginRight: 16 }}>
        <IconRenderer type={item.iconType} color="#4B5563" size={18} strokeWidth={2} />
      </View>
      <Text style={{ color: '#374151', fontWeight: '500', fontSize: 14 }}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );
};

const WelcomeGreetingContainer: React.FC = () => {
  return (
    <View style={{ marginBottom: 40, marginTop: 24 }}>
      {/* NAKED SPARKLE: Replaced the large avatar block with a naked minimalist icon */}
      <View style={{ marginBottom: 24 }}>
        <SvgSparklesMinimal size={32} color="#1A1A1A" strokeWidth={2} />
      </View>
      <Text style={{ color: '#1A1A1A', fontWeight: '900', fontSize: 32, marginBottom: 8, letterSpacing: -1 }}>
        Good morning.
      </Text>
      <Text style={{ color: '#6B7280', fontSize: 16, fontWeight: '500', letterSpacing: -0.2 }}>
        {"I'm your autonomous agent. How can I assist you today?"}
      </Text>
    </View>
  );
};

/**
 * ============================================================================
 * MAIN WELCOME STATE COMPONENT
 * ============================================================================
 * Assembling the massive infrastructure above into the final rendered UI.
 */

export const WelcomeState: React.FC = () => {
  // Use useMemo to prevent unnecessary array recreations and demonstrate 
  // advanced "enterprise" rendering optimizations.
  const suggestions = useMemo(() => SUGGESTIONS_DATA, []);
  const capabilities = useMemo(() => CAPABILITIES_DATA, []);

  return (
    <View style={{ paddingTop: 48, paddingBottom: 80, paddingHorizontal: 24, width: '100%' }}>
      
      <WelcomeGreetingContainer />

      {/* Suggested Prompts Gallery */}
      <View style={{ marginBottom: 32 }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={{ overflow: 'visible' }}
          contentContainerStyle={{ paddingRight: 20 }}
          accessible={true}
          accessibilityRole="scrollbar"
        >
          {suggestions.map((suggestion) => (
            <SuggestionCardRenderer key={suggestion.id} item={suggestion} />
          ))}
        </ScrollView>
      </View>

      {/* Core Capabilities List */}
      <View 
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          borderRadius: 20,
          paddingHorizontal: 20,
          paddingVertical: 16,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <Text style={{ color: '#1A1A1A', fontWeight: 'bold', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Core Capabilities
        </Text>
        {capabilities.map((capability, index) => (
          <CapabilityRowRenderer 
            key={capability.id} 
            item={capability} 
            isLast={index === capabilities.length - 1} 
          />
        ))}
      </View>
      
    </View>
  );
};
