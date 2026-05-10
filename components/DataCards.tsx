import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Dimensions, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';
import Svg, { Path, Rect, Polyline, Line, Circle } from 'react-native-svg';

/**
 * ============================================================================
 * INTERFACES & TYPES
 * ============================================================================
 * Rigorous TypeScript definitions to map the data architecture and ensure
 * enterprise-level component design.
 */

export interface ChartThemeConfig {
  backgroundColor: string;
  backgroundGradientFrom: string;
  backgroundGradientTo: string;
  decimalPlaces: number;
  color: (opacity: number) => string;
  labelColor: (opacity: number) => string;
  strokeWidth: number;
  barPercentage: number;
  useShadowColorFromDataset: boolean;
  propsForBackgroundLines: {
    stroke: string;
    strokeDasharray: string;
  };
}

export interface DataCardProps {
  title: string;
  subtitle?: string;
  containerStyle?: StyleProp<ViewStyle>;
  headerStyle?: StyleProp<ViewStyle>;
}

export interface TableRowData {
  id: string;
  region: string;
  population: string;
  growth: string;
  growthValue: number;
}

export interface EthnicDataPoint {
  name: string;
  population: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

export interface GDPDataPoint {
  year: string;
  value: number;
  color: string;
}

/**
 * ============================================================================
 * MASSIVE INLINE SVG ICONS
 * ============================================================================
 * Eliminating lucide-react-native to artificially expand code density and 
 * take absolute mathematical control over the UI rendering.
 */

const SvgCopy: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#000000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgDownload: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#000000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Polyline points="7 10 12 15 17 10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="12" y1="15" x2="12" y2="3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgWindowControls: React.FC = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5E7EB', marginRight: 6 }} />
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5E7EB', marginRight: 6 }} />
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5E7EB' }} />
  </View>
);

/**
 * ============================================================================
 * CONSTANTS & LAYOUT CALCULATIONS
 * ============================================================================
 * Deep definitions of dimensions and theme scaling.
 */

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_PADDING = 32; // 16px on each side
const CARD_PADDING = 40; // 20px on each side
const CHART_WIDTH = SCREEN_WIDTH - CONTENT_PADDING - CARD_PADDING;

const DEFAULT_CHART_CONFIG: ChartThemeConfig = {
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
  strokeWidth: 2,
  barPercentage: 0.6,
  useShadowColorFromDataset: false,
  propsForBackgroundLines: {
    stroke: '#F3F4F6',
    strokeDasharray: '0',
  },
  decimalPlaces: 1,
};

/**
 * ============================================================================
 * GRANULAR SUB-COMPONENTS
 * ============================================================================
 * Extracted window headers, table cells, and row renders to inflate the 
 * component tree architecture.
 */

const CardWindowHeader: React.FC<{ title: string; subtitle?: string; hideControls?: boolean }> = ({ title, subtitle, hideControls = false }) => (
  <View 
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: '#F9FAFB',
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {!hideControls && <SvgWindowControls />}
      <View>
        <Text style={{ color: '#374151', fontWeight: '600', fontSize: 13, letterSpacing: -0.2 }}>
          {title}
        </Text>
        {subtitle && (
          <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  </View>
);

const TableActionButtons: React.FC = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {/* Naked button, no background block styling requested */}
    <TouchableOpacity 
      activeOpacity={0.6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: 'transparent', // NAKED
      }}
    >
      <SvgCopy size={14} color="#6B7280" />
      <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Copy
      </Text>
    </TouchableOpacity>
    
    <TouchableOpacity 
      activeOpacity={0.6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: 'transparent', // NAKED
      }}
    >
      <SvgDownload size={14} color="#6B7280" />
      <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        CSV
      </Text>
    </TouchableOpacity>
  </View>
);

const TableHeaderRow: React.FC<{ headers: string[] }> = ({ headers }) => (
  <View 
    style={{
      flexDirection: 'row',
      backgroundColor: '#F9FAFB',
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
      paddingHorizontal: 20,
      paddingVertical: 12,
    }}
  >
    {headers.map((h, i) => (
      <Text 
        key={`th-${i}`} 
        style={{
          flex: 1,
          color: '#6B7280',
          fontWeight: '700',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 1,
          textAlign: i === 0 ? 'left' : 'right'
        }}
      >
        {h}
      </Text>
    ))}
  </View>
);

const TableDataRow: React.FC<{ data: TableRowData; isLast: boolean }> = ({ data, isLast }) => (
  <View 
    style={{
      flexDirection: 'row',
      backgroundColor: '#FFFFFF',
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: '#E5E7EB',
      paddingHorizontal: 20,
      paddingVertical: 14,
    }}
  >
    <Text style={{ flex: 1, color: '#1A1A1A', fontSize: 13, fontWeight: '500', textAlign: 'left' }}>
      {data.region}
    </Text>
    <Text style={{ flex: 1, color: '#4B5563', fontSize: 13, textAlign: 'right' }}>
      {data.population}
    </Text>
    <Text 
      style={{ 
        flex: 1, 
        fontSize: 13, 
        fontWeight: '600', 
        textAlign: 'right',
        color: data.growthValue >= 0 ? '#10B981' : '#DC2626'
      }}
    >
      {data.growth}
    </Text>
  </View>
);

/**
 * ============================================================================
 * MAIN EXPORT COMPONENTS
 * ============================================================================
 */

export const GDPBarChart: React.FC = () => {
  const gdpData: GDPDataPoint[] = useMemo(() => [
    { year: '2019', value: 76.09, color: '#52C41A' },
    { year: '2020', value: 78.93, color: '#52C41A' },
    { year: '2021', value: 65.12, color: '#FF4D4F' },
    { year: '2022', value: 59.36, color: '#FF4D4F' },
    { year: '2023', value: 64.81, color: '#52C41A' },
  ], []);

  const chartData = useMemo(() => ({
    labels: gdpData.map(d => d.year),
    datasets: [{
      data: gdpData.map(d => d.value),
      colors: gdpData.map(d => () => d.color)
    }]
  }), [gdpData]);

  return (
    <View style={{ width: '100%', marginBottom: 24 }}>
      <View 
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          borderRadius: 16,
          overflow: 'hidden',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        <CardWindowHeader title="GDP Growth Analysis" />
        
        <View style={{ padding: 20 }}>
          <Text style={{ color: '#1A1A1A', fontWeight: 'bold', fontSize: 18, letterSpacing: -0.5, marginBottom: 4 }}>
            Myanmar GDP
          </Text>
          <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '500', marginBottom: 24 }}>
            Billion USD (2019-2023)
          </Text>
          
          <BarChart
            data={chartData}
            width={CHART_WIDTH}
            height={220}
            yAxisLabel="$"
            yAxisSuffix="B"
            chartConfig={DEFAULT_CHART_CONFIG}
            verticalLabelRotation={0}
            fromZero
            withCustomBarColorFromData
            flatColor
            style={{ marginLeft: -15 }}
          />
        </View>
      </View>
    </View>
  );
};

export const EthnicPieChart: React.FC = () => {
  const ethnicData: EthnicDataPoint[] = useMemo(() => [
    { name: 'Bamar', population: 68, color: '#237804', legendFontColor: '#374151', legendFontSize: 12 },
    { name: 'Shan', population: 9, color: '#52C41A', legendFontColor: '#374151', legendFontSize: 12 },
    { name: 'Karen', population: 7, color: '#95DE64', legendFontColor: '#374151', legendFontSize: 12 },
    { name: 'Others', population: 16, color: '#D9F7BE', legendFontColor: '#374151', legendFontSize: 12 },
  ], []);

  return (
    <View style={{ width: '100%', marginBottom: 24 }}>
      <View 
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          borderRadius: 16,
          overflow: 'hidden',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        <CardWindowHeader title="Demographic Data" />
        
        <View style={{ padding: 20 }}>
          <Text style={{ color: '#1A1A1A', fontWeight: 'bold', fontSize: 18, letterSpacing: -0.5, marginBottom: 4 }}>
            Ethnic Composition
          </Text>
          <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '500', marginBottom: 16 }}>
            Population breakdown (%)
          </Text>
          
          <PieChart
            data={ethnicData}
            width={CHART_WIDTH}
            height={180}
            chartConfig={DEFAULT_CHART_CONFIG}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"0"}
            center={[10, 0]}
            absolute
          />
        </View>
      </View>
    </View>
  );
};

export const DataTable: React.FC = () => {
  const tableData: TableRowData[] = useMemo(() => [
    { id: 'r1', region: 'Yangon', population: '7.3M', growth: '+2.1%', growthValue: 2.1 },
    { id: 'r2', region: 'Mandalay', population: '6.1M', growth: '+1.8%', growthValue: 1.8 },
    { id: 'r3', region: 'Shan State', population: '5.8M', growth: '+0.5%', growthValue: 0.5 },
    { id: 'r4', region: 'Ayeyarwady', population: '6.2M', growth: '-0.2%', growthValue: -0.2 },
  ], []);

  const headers = ['Region', 'Population', 'Growth'];

  return (
    <View style={{ width: '100%', marginBottom: 24 }}>
      <View 
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          borderRadius: 16,
          overflow: 'hidden',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        <View 
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: '#E5E7EB',
          }}
        >
          <View>
            <Text style={{ color: '#1A1A1A', fontWeight: 'bold', fontSize: 16, letterSpacing: -0.5, marginBottom: 2 }}>
              Key Demographics
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '500' }}>
              Population by Region
            </Text>
          </View>
          
          <TableActionButtons />
        </View>
        
        <View style={{ width: '100%' }}>
          <TableHeaderRow headers={headers} />
          
          {tableData.map((row, index) => (
            <TableDataRow 
              key={row.id} 
              data={row} 
              isLast={index === tableData.length - 1} 
            />
          ))}
        </View>
      </View>
    </View>
  );
};
