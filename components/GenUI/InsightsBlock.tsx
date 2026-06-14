/**
 * InsightsBlock — an inline GenUI data-visualization stack rendered directly
 * in the chat conversation. Mirrors the Pencil `GenUI/1 · Data Visualization`
 * cells and the `Screen · Chat · Insights` ReportWrap: a vertical stack of
 * warm-canvas chart cards (sparkline KPI, bar chart, donut + legend) drawn
 * with `react-native-svg`. Pure presentational; falls back to SAMPLE data when
 * `data` is missing or malformed.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface SparkData {
  title: string;
  subtitle: string;
  value: string;
  delta: string;
  up: boolean;
  points: number[];
}

interface BarData {
  title: string;
  subtitle: string;
  bars: { label: string; value: number }[];
}

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutData {
  title: string;
  slices: DonutSlice[];
}

interface InsightsData {
  spark: SparkData;
  bar: BarData;
  donut: DonutData;
}

const SAMPLE: InsightsData = {
  spark: {
    title: 'API usage',
    subtitle: 'Requests / hr',
    value: '24.8K',
    delta: '+12%',
    up: true,
    points: [28, 39, 32, 49, 42, 56, 46, 63, 70],
  },
  bar: {
    title: 'Monthly sales',
    subtitle: '2026 · USD',
    bars: [
      { label: 'Jan', value: 48 },
      { label: 'Feb', value: 66 },
      { label: 'Mar', value: 58 },
      { label: 'Apr', value: 74 },
      { label: 'May', value: 70 },
      { label: 'Jun', value: 92 },
    ],
  },
  donut: {
    title: 'Traffic sources',
    slices: [
      { label: 'Direct', value: 42, color: Candle.flame },
      { label: 'Organic', value: 28, color: Candle.flameCore },
      { label: 'Paid', value: 18, color: Candle.flameDeep },
      { label: 'Social', value: 12, color: Candle.ember },
    ],
  },
};

/** Coerce an unknown payload into safe InsightsData, falling back per-field. */
function normalize(data: unknown): InsightsData {
  if (!data || typeof data !== 'object') return SAMPLE;
  const d = data as Record<string, unknown>;

  const spark = ((): SparkData => {
    const s = d.spark as Record<string, unknown> | undefined;
    if (!s || typeof s !== 'object') return SAMPLE.spark;
    const points = Array.isArray(s.points)
      ? (s.points as unknown[]).filter((n): n is number => typeof n === 'number' && isFinite(n))
      : [];
    return {
      title: typeof s.title === 'string' ? s.title : SAMPLE.spark.title,
      subtitle: typeof s.subtitle === 'string' ? s.subtitle : SAMPLE.spark.subtitle,
      value: typeof s.value === 'string' ? s.value : SAMPLE.spark.value,
      delta: typeof s.delta === 'string' ? s.delta : SAMPLE.spark.delta,
      up: typeof s.up === 'boolean' ? s.up : SAMPLE.spark.up,
      points: points.length >= 2 ? points : SAMPLE.spark.points,
    };
  })();

  const bar = ((): BarData => {
    const b = d.bar as Record<string, unknown> | undefined;
    if (!b || typeof b !== 'object') return SAMPLE.bar;
    const bars = Array.isArray(b.bars)
      ? (b.bars as unknown[])
          .map((x) => {
            const r = x as Record<string, unknown>;
            if (!r || typeof r !== 'object') return null;
            const value = typeof r.value === 'number' && isFinite(r.value) ? r.value : null;
            if (value === null) return null;
            return { label: typeof r.label === 'string' ? r.label : '', value };
          })
          .filter((x): x is { label: string; value: number } => x !== null)
      : [];
    return {
      title: typeof b.title === 'string' ? b.title : SAMPLE.bar.title,
      subtitle: typeof b.subtitle === 'string' ? b.subtitle : SAMPLE.bar.subtitle,
      bars: bars.length > 0 ? bars : SAMPLE.bar.bars,
    };
  })();

  const donut = ((): DonutData => {
    const o = d.donut as Record<string, unknown> | undefined;
    if (!o || typeof o !== 'object') return SAMPLE.donut;
    const ramp = [Candle.flame, Candle.flameCore, Candle.flameDeep, Candle.ember];
    const slices = Array.isArray(o.slices)
      ? (o.slices as unknown[])
          .map((x, i) => {
            const r = x as Record<string, unknown>;
            if (!r || typeof r !== 'object') return null;
            const value = typeof r.value === 'number' && isFinite(r.value) ? r.value : null;
            if (value === null) return null;
            return {
              label: typeof r.label === 'string' ? r.label : '',
              value,
              color: typeof r.color === 'string' ? r.color : ramp[i % ramp.length],
            };
          })
          .filter((x): x is DonutSlice => x !== null)
      : [];
    return {
      title: typeof o.title === 'string' ? o.title : SAMPLE.donut.title,
      slices: slices.length > 0 ? slices : SAMPLE.donut.slices,
    };
  })();

  return { spark, bar, donut };
}

/** Build a smooth-ish polyline path + matching filled area for the sparkline. */
function buildSparkPaths(points: number[], w: number, h: number, pad = 6) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = innerW / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + innerH - ((p - min) / span) * innerH;
    return { x, y };
  });
  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)} ${h - pad} L${coords[0].x.toFixed(
    1,
  )} ${h - pad} Z`;
  return { line, area };
}

function SparkCard({ spark }: { spark: SparkData }) {
  const W = 280;
  const H = 84;
  const { line, area } = useMemo(() => buildSparkPaths(spark.points, W, H), [spark.points]);
  const deltaColor = spark.up ? Candle.success : Candle.ember;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{spark.title}</Text>
        <Text style={styles.cardSub}>{spark.subtitle}</Text>
      </View>
      <View style={styles.sparkValueRow}>
        <Text style={styles.bigValue}>{spark.value}</Text>
        <Text style={[styles.delta, { color: deltaColor }]}>{spark.delta}</Text>
      </View>
      <View style={styles.sparkPlot}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <Path d={area} fill={Candle.accentSoft} />
          <Path
            d={line}
            stroke={Candle.flame}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
    </View>
  );
}

function BarCard({ bar }: { bar: BarData }) {
  const W = 280;
  const H = 120;
  const max = Math.max(...bar.bars.map((b) => b.value)) || 1;
  const n = bar.bars.length;
  const gap = 10;
  const barW = (W - gap * (n - 1)) / n;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{bar.title}</Text>
        <Text style={styles.cardSub}>{bar.subtitle}</Text>
      </View>
      <View style={styles.barPlot}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {bar.bars.map((b, i) => {
            const barH = Math.max(4, (b.value / max) * (H - 4));
            const x = i * (barW + gap);
            const y = H - barH;
            return (
              <Rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={4}
                fill={i === n - 1 ? Candle.flame : Candle.flameCore}
              />
            );
          })}
        </Svg>
      </View>
      <View style={styles.barLabels}>
        {bar.bars.map((b, i) => (
          <Text key={i} style={styles.barLabel} numberOfLines={1}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function DonutCard({ donut }: { donut: DonutData }) {
  const size = 96;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = donut.slices.reduce((sum, s) => sum + s.value, 0) || 1;

  let offset = 0;
  const arcs = donut.slices.map((s, i) => {
    const frac = s.value / total;
    const dash = frac * circumference;
    const arc = {
      key: i,
      color: s.color,
      dashArray: `${dash} ${circumference - dash}`,
      dashOffset: -offset,
    };
    offset += dash;
    return arc;
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{donut.title}</Text>
      </View>
      <View style={styles.donutRow}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={cx} cy={cy} r={r} stroke="#E8DECF" strokeWidth={stroke} fill="none" />
          {arcs.map((a) => (
            <Circle
              key={a.key}
              cx={cx}
              cy={cy}
              r={r}
              stroke={a.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={a.dashArray}
              strokeDashoffset={a.dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
        </Svg>
        <View style={styles.legend}>
          {donut.slices.map((s, i) => {
            const pct = Math.round((s.value / total) * 100);
            return (
              <View key={i} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {s.label}
                </Text>
                <Text style={styles.legendValue}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export function InsightsBlock({ data }: { data?: unknown }) {
  const model = useMemo(() => normalize(data), [data]);
  return (
    <View style={styles.root}>
      <SparkCard spark={model.spark} />
      <BarCard bar={model.bar} />
      <DonutCard donut={model.donut} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    width: '100%',
  },
  card: {
    gap: 12,
    borderRadius: 16,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 16,
    overflow: 'hidden',
  },
  cardHead: {
    gap: 2,
  },
  cardTitle: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  cardSub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11,
    color: Candle.textTertiary,
  },
  sparkValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bigValue: {
    fontFamily: CandleFontFamilies.mono,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: Candle.textPrimary,
  },
  delta: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 12,
    fontWeight: '600',
    paddingBottom: 5,
  },
  sparkPlot: {
    height: 84,
  },
  barPlot: {
    height: 120,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: CandleFontFamilies.inter,
    fontSize: 10.5,
    color: Candle.textTertiary,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legend: {
    flex: 1,
    gap: 7,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  legendLabel: {
    flex: 1,
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  legendValue: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
});
