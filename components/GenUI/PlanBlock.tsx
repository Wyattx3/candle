/**
 * PlanBlock — an inline GenUI project plan / timeline rendered in the chat
 * stream. Mirrors the Pencil `GenUI/5 · Project Planning` "Timeline / Gantt"
 * cell: a warm-canvas card titled "Sprint roadmap" with phase rows, each a
 * fixed-width label plus a positioned bar on a shared track. Each phase
 * carries a status that tints its bar (done / active / upcoming). Pure
 * presentational; falls back to SAMPLE data when `data` is missing or
 * malformed.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

type PhaseStatus = 'done' | 'active' | 'upcoming';

interface Phase {
  label: string;
  /** Fractional start along the timeline, 0..1. */
  start: number;
  /** Fractional span along the timeline, 0..1. */
  span: number;
  status: PhaseStatus;
}

interface PlanData {
  title: string;
  phases: Phase[];
}

const SAMPLE: PlanData = {
  title: 'Sprint roadmap',
  phases: [
    { label: 'Research', start: 0, span: 0.25, status: 'done' },
    { label: 'Design', start: 0.2, span: 0.3, status: 'done' },
    { label: 'Build', start: 0.42, span: 0.4, status: 'active' },
    { label: 'Test', start: 0.74, span: 0.26, status: 'upcoming' },
  ],
};

const BAR_FILL: Record<PhaseStatus, string> = {
  done: Candle.flameCore,
  active: Candle.flame,
  upcoming: '#E8DECF',
};

const PILL_FILL: Record<PhaseStatus, string> = {
  done: Candle.successSoft,
  active: Candle.accentSoft,
  upcoming: Candle.surfaceSunken,
};

const PILL_TEXT: Record<PhaseStatus, string> = {
  done: Candle.success,
  active: Candle.flame,
  upcoming: Candle.textTertiary,
};

const PILL_LABEL: Record<PhaseStatus, string> = {
  done: 'Done',
  active: 'Active',
  upcoming: 'Upcoming',
};

function isStatus(v: unknown): v is PhaseStatus {
  return v === 'done' || v === 'active' || v === 'upcoming';
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Coerce an unknown payload into safe PlanData. */
function normalize(data: unknown): PlanData {
  if (!data || typeof data !== 'object') return SAMPLE;
  const d = data as Record<string, unknown>;
  const phases = Array.isArray(d.phases)
    ? (d.phases as unknown[])
        .map((p): Phase | null => {
          const r = p as Record<string, unknown>;
          if (!r || typeof r !== 'object' || typeof r.label !== 'string') return null;
          const start = clamp01(typeof r.start === 'number' ? r.start : 0);
          const rawSpan = typeof r.span === 'number' ? r.span : 0.25;
          const span = clamp01(rawSpan) || 0.1;
          return {
            label: r.label,
            start,
            span: Math.min(span, 1 - start) || span,
            status: isStatus(r.status) ? r.status : 'upcoming',
          };
        })
        .filter((p): p is Phase => p !== null)
    : [];
  return {
    title: typeof d.title === 'string' ? d.title : SAMPLE.title,
    phases: phases.length > 0 ? phases : SAMPLE.phases,
  };
}

function PhaseRow({ phase }: { phase: Phase }) {
  const left: `${number}%` = `${Number((phase.start * 100).toFixed(2))}%`;
  const width: `${number}%` = `${Number((phase.span * 100).toFixed(2))}%`;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {phase.label}
      </Text>
      <View style={styles.track}>
        <View
          style={[styles.bar, { left, width, backgroundColor: BAR_FILL[phase.status] }]}
        >
          <View style={[styles.pill, { backgroundColor: PILL_FILL[phase.status] }]}>
            <Text style={[styles.pillText, { color: PILL_TEXT[phase.status] }]} numberOfLines={1}>
              {PILL_LABEL[phase.status]}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function PlanBlock({ data }: { data?: unknown }) {
  const model = useMemo(() => normalize(data), [data]);
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>{model.title}</Text>
        <View style={styles.rows}>
          {model.phases.map((phase, i) => (
            <PhaseRow key={i} phase={phase} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  card: {
    gap: 14,
    borderRadius: 16,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 16,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  rows: {
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    width: 62,
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 11.5,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  track: {
    flex: 1,
    height: 22,
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    height: 22,
    minWidth: 28,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  pillText: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 9.5,
    fontWeight: '600',
  },
});
