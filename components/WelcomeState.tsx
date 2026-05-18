import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { LiquidGlass } from './LiquidGlass';

interface SuggestionItem {
  id: string;
  title: string;
  subtitle: string;
  iconType: string;
  colorHex: string;
}

interface CapabilityItem {
  id: string;
  title: string;
  iconType: string;
}

const SvgSearch = ({ size = 20, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={2} />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const SvgDatabase = ({ size = 20, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21 5C21 6.65685 16.9706 8 12 8C7.02944 8 3 6.65685 3 5" stroke={color} strokeWidth={2} />
    <Path d="M3 5V19C3 20.6569 7.02944 22 12 22C16.9706 22 21 20.6569 21 19V5" stroke={color} strokeWidth={2} />
    <Path d="M21 12C21 13.6569 16.9706 15 12 15C7.02944 15 3 13.6569 3 12" stroke={color} strokeWidth={2} />
  </Svg>
);

const SvgCode = ({ size = 20, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Polyline points="16 18 22 12 16 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Polyline points="8 6 2 12 8 18" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgDashboard = ({ size = 20, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="7" height="9" stroke={color} strokeWidth={2} />
    <Rect x="14" y="3" width="7" height="5" stroke={color} strokeWidth={2} />
    <Rect x="14" y="12" width="7" height="9" stroke={color} strokeWidth={2} />
    <Rect x="3" y="16" width="7" height="5" stroke={color} strokeWidth={2} />
  </Svg>
);

const SvgPen = ({ size = 20, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 19L21.5 9.5C22.3284 8.67157 22.3284 7.32843 21.5 6.5C20.6716 5.67157 19.3284 5.67157 18.5 6.5L9 16L12 19Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M2 22L5.5 21L3 18.5L2 22Z" fill={color} stroke={color} strokeWidth={2} />
  </Svg>
);

const IconRenderer = ({ type, color, size = 18 }: { type: string; color: string; size?: number }) => {
  switch (type) {
    case 'search':
      return <SvgSearch color={color} size={size} />;
    case 'database':
      return <SvgDatabase color={color} size={size} />;
    case 'code':
      return <SvgCode color={color} size={size} />;
    case 'dashboard':
      return <SvgDashboard color={color} size={size} />;
    case 'pen':
      return <SvgPen color={color} size={size} />;
    default:
      return null;
  }
};

const SUGGESTIONS: SuggestionItem[] = [
  { id: '1', title: 'Market Research', subtitle: 'Analyze tech trends in SEA', iconType: 'search', colorHex: '#0077E6' },
  { id: '2', title: 'Data Visualization', subtitle: 'Build charts from CSV', iconType: 'database', colorHex: '#248A3D' },
  { id: '3', title: 'Write Code', subtitle: 'Generate React components', iconType: 'code', colorHex: '#8E44AD' },
];

const CAPABILITIES: CapabilityItem[] = [
  { id: '1', title: 'Search the live web', iconType: 'search' },
  { id: '2', title: 'Execute Python and JS', iconType: 'code' },
  { id: '3', title: 'Connect to external APIs', iconType: 'dashboard' },
  { id: '4', title: 'Draft documents and reports', iconType: 'pen' },
];

export const WelcomeState: React.FC = () => (
  <View style={styles.root}>
    <LiquidGlass
      borderRadius={30}
      variant="regular"
      intensity={68}
      style={styles.panel}
      contentStyle={styles.panelContent}
    >
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Start</Text>
        {SUGGESTIONS.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.68}
            style={[styles.row, index < SUGGESTIONS.length - 1 && styles.rowDivider]}
          >
            <View style={[styles.iconWell, { backgroundColor: `${item.colorHex}12` }]}>
              <IconRenderer type={item.iconType} color={item.colorHex} size={18} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>{item.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Core Capabilities</Text>
        {CAPABILITIES.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.62}
            style={[styles.capRow, index < CAPABILITIES.length - 1 && styles.rowDivider]}
          >
            <IconRenderer type={item.iconType} color="#5D6470" size={17} />
            <Text style={styles.capText}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </LiquidGlass>
  </View>
);

const styles = StyleSheet.create({
  root: {
    paddingTop: 28,
    paddingBottom: 80,
    paddingHorizontal: 18,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  panel: {
    minHeight: 420,
  },
  panelContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 14,
  },
  rowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(60,60,67,0.1)',
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#1C1C1E',
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 3,
    letterSpacing: 0,
  },
  rowSubtitle: {
    color: '#69717D',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
  },
  capText: {
    color: '#1C1C1E',
    fontWeight: '500',
    fontSize: 15,
    letterSpacing: 0,
  },
});
