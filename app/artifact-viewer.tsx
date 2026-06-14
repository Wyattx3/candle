/**
 * Artifact Viewer — previews a file the agent generated (here a revenue
 * dashboard). Mirrors the Pencil `Screen · Artifact Viewer` node: a NavBar
 * (back, title + timestamp, more), a Body with a Preview/Code/Data segment and
 * a rendered artifact preview (KPIs, trend bars, channel split), and a docked
 * Open-in-browser / Download action pair.
 */
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    CalendarDays,
    Download,
    ExternalLink,
    MoreHorizontal,
    TrendingDown,
    TrendingUp,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

type Tab = 'preview' | 'code' | 'data';

interface Kpi {
  id: string;
  label: string;
  value: string;
  delta: string;
  up: boolean;
}

const KPIS: Kpi[] = [
  { id: 'rev', label: 'Revenue', value: '$48.2K', delta: '+12%', up: true },
  { id: 'ord', label: 'Orders', value: '1,284', delta: '+8%', up: true },
  { id: 'aov', label: 'AOV', value: '$37.50', delta: '+3%', up: true },
  { id: 'ref', label: 'Refunds', value: '$420', delta: '-2%', up: false },
];

const TREND_BARS = [48, 66, 58, 74, 70, 86, 78, 96, 89, 106, 98, 120];

interface Channel {
  id: string;
  label: string;
  pct: string;
  width: number;
  color: string;
}

const CHANNELS: Channel[] = [
  { id: 'direct', label: 'Direct', pct: '80%', width: 182, color: '#FF9500' },
  { id: 'organic', label: 'Organic', pct: '62%', width: 141, color: '#FFB340' },
  { id: 'paid', label: 'Paid', pct: '45%', width: 103, color: '#E8930F' },
  { id: 'social', label: 'Social', pct: '30%', width: 68, color: '#C77400' },
];

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Trend = kpi.up ? TrendingUp : TrendingDown;
  const tint = kpi.up ? Candle.success : Candle.danger;
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{kpi.label}</Text>
      <Text style={styles.kpiValue}>{kpi.value}</Text>
      <View style={styles.kpiDelta}>
        <Trend size={12} color={tint} />
        <Text style={[styles.kpiDeltaLabel, { color: tint }]}>{kpi.delta}</Text>
      </View>
    </View>
  );
}

export default function ArtifactViewerScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('preview');

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        {/* NavBar */}
        <View style={styles.navBar}>
          <View style={styles.navLeft}>
            <Pressable
              style={styles.iconBtn}
              hitSlop={8}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ArrowLeft size={21} color={Candle.textPrimary} />
            </Pressable>
            <View style={styles.titleCol}>
              <Text style={styles.title}>revenue-dashboard</Text>
              <Text style={styles.subtitle}>Generated · 2 min ago</Text>
            </View>
          </View>
          <Pressable
            style={styles.iconBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <MoreHorizontal size={21} color={Candle.textSecondary} />
          </Pressable>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Segment control */}
          <View style={styles.segment}>
            {(['preview', 'code', 'data'] as Tab[]).map((t) => {
              const active = tab === t;
              const label = t === 'preview' ? 'Preview' : t === 'code' ? 'Code' : 'Data';
              return (
                <Pressable
                  key={t}
                  style={[styles.segBtn, active ? styles.segBtnActive : null]}
                  onPress={() => setTab(t)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <Text style={[styles.segLabel, active ? styles.segLabelActive : null]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Preview surface */}
          <View style={styles.preview}>
            <ScrollView
              contentContainerStyle={styles.artifact}
              showsVerticalScrollIndicator={false}
            >
              {/* Artifact header */}
              <View style={styles.artifactHeader}>
                <View style={styles.artifactTitleCol}>
                  <Text style={styles.artifactTitle}>Revenue dashboard</Text>
                  <Text style={styles.artifactSub}>Last 30 days · live</Text>
                </View>
                <View style={styles.range}>
                  <CalendarDays size={14} color={Candle.textSecondary} />
                  <Text style={styles.rangeLabel}>30D</Text>
                </View>
              </View>

              {/* KPIs */}
              <View style={styles.kpis}>
                {KPIS.map((kpi) => (
                  <KpiCard key={kpi.id} kpi={kpi} />
                ))}
              </View>

              {/* Charts */}
              <View style={styles.charts}>
                {/* Trend */}
                <View style={styles.chartCard}>
                  <Text style={styles.chartTitle}>Revenue trend</Text>
                  <View style={styles.bars}>
                    {TREND_BARS.map((h, i) => (
                      <View key={i} style={[styles.bar, { height: h }]} />
                    ))}
                  </View>
                </View>

                {/* Channel split */}
                <View style={styles.chartCard}>
                  <Text style={styles.chartTitle}>By channel</Text>
                  {CHANNELS.map((c) => (
                    <View key={c.id} style={styles.channel}>
                      <View style={styles.channelRow}>
                        <Text style={styles.channelLabel}>{c.label}</Text>
                        <Text style={styles.channelPct}>{c.pct}</Text>
                      </View>
                      <View style={styles.track}>
                        <View
                          style={[styles.fill, { width: c.width, backgroundColor: c.color }]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Dock */}
        <View style={styles.dock}>
          <Pressable
            style={[styles.dockBtn, styles.secondaryBtn]}
            accessibilityRole="button"
            accessibilityLabel="Open in browser"
          >
            <ExternalLink size={18} color={Candle.textPrimary} />
            <Text style={styles.secondaryLabel}>Open in browser</Text>
          </Pressable>
          <Pressable
            style={[styles.dockBtn, styles.primaryBtn]}
            accessibilityRole="button"
            accessibilityLabel="Download"
          >
            <Download size={18} color="#FFFDF8" />
            <Text style={styles.primaryLabel}>Download</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Candle.bgCanvas,
  },
  safe: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    gap: 1,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 15.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  subtitle: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12,
    color: Candle.textTertiary,
  },
  body: {
    flex: 1,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 16,
  },
  segment: {
    flexDirection: 'row',
    gap: 4,
    borderRadius: 12,
    backgroundColor: Candle.surfaceSunken,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnActive: {
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
  },
  segLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 13.5,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  segLabelActive: {
    fontFamily: CandleFontFamilies.interBold,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  preview: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#C8A06E',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  artifact: {
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 14,
  },
  artifactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  artifactTitleCol: {
    gap: 2,
  },
  artifactTitle: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Candle.textPrimary,
  },
  artifactSub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12,
    color: Candle.textTertiary,
  },
  range: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    borderRadius: 9,
    backgroundColor: Candle.surfaceSunken,
    paddingHorizontal: 12,
  },
  rangeLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
  kpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCard: {
    flexGrow: 1,
    flexBasis: '47%',
    gap: 3,
    borderRadius: 12,
    backgroundColor: Candle.surfaceSunken,
    padding: 13,
  },
  kpiLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 11,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  kpiValue: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Candle.textPrimary,
  },
  kpiDelta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  kpiDeltaLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 10.5,
    fontWeight: '600',
  },
  charts: {
    gap: 12,
  },
  chartCard: {
    gap: 10,
    borderRadius: 12,
    backgroundColor: Candle.surfaceSunken,
    padding: 14,
  },
  chartTitle: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 7,
    height: 120,
  },
  bar: {
    flex: 1,
    backgroundColor: Candle.flame,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  channel: {
    gap: 5,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 11,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  channelPct: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 11,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E8DECF',
    overflow: 'hidden',
  },
  fill: {
    height: 7,
    borderRadius: 4,
  },
  dock: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  dockBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    borderRadius: 14,
  },
  secondaryBtn: {
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
  },
  secondaryLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  primaryBtn: {
    backgroundColor: Candle.flame,
    shadowColor: Candle.flameDeep,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  primaryLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFDF8',
  },
});
