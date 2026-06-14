/**
 * WorkersBlock — an inline GenUI parallel-subagent worker panel rendered in
 * the chat stream. Built in the language of the Pencil GenUI kit (warm-canvas
 * card, hairline border, flame accent, mono numerics): a titled card with one
 * row per worker showing name, current task, a flame progress bar, and a
 * status pill (running / done / queued). Pure presentational; falls back to
 * SAMPLE data when `data` is missing or malformed.
 */
import { CircleCheck, Clock, Loader } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

type WorkerStatus = 'running' | 'done' | 'queued';

interface Worker {
  name: string;
  task: string;
  progress: number; // 0..1
  status: WorkerStatus;
}

interface WorkersData {
  title: string;
  subtitle: string;
  workers: Worker[];
}

const SAMPLE: WorkersData = {
  title: 'Parallel workers',
  subtitle: '3 subagents · 1 running',
  workers: [
    { name: 'researcher', task: 'Scanning 24 sources', progress: 0.62, status: 'running' },
    { name: 'summarizer', task: 'Condensing findings', progress: 1, status: 'done' },
    { name: 'verifier', task: 'Cross-checking claims', progress: 0, status: 'queued' },
  ],
};

const STATUS_META: Record<
  WorkerStatus,
  { label: string; fill: string; text: string; bar: string }
> = {
  running: { label: 'Running', fill: Candle.accentSoft, text: Candle.flame, bar: Candle.flame },
  done: { label: 'Done', fill: Candle.successSoft, text: Candle.success, bar: Candle.success },
  queued: {
    label: 'Queued',
    fill: Candle.surfaceSunken,
    text: Candle.textTertiary,
    bar: Candle.flameCore,
  },
};

function isStatus(v: unknown): v is WorkerStatus {
  return v === 'running' || v === 'done' || v === 'queued';
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Coerce an unknown payload into safe WorkersData. */
function normalize(data: unknown): WorkersData {
  if (!data || typeof data !== 'object') return SAMPLE;
  const d = data as Record<string, unknown>;
  const workers = Array.isArray(d.workers)
    ? (d.workers as unknown[])
        .map((w): Worker | null => {
          const r = w as Record<string, unknown>;
          if (!r || typeof r !== 'object' || typeof r.name !== 'string') return null;
          const status = isStatus(r.status) ? r.status : 'queued';
          const progress =
            status === 'done'
              ? 1
              : clamp01(typeof r.progress === 'number' ? r.progress : 0);
          return {
            name: r.name,
            task: typeof r.task === 'string' ? r.task : '',
            progress,
            status,
          };
        })
        .filter((w): w is Worker => w !== null)
    : [];
  return {
    title: typeof d.title === 'string' ? d.title : SAMPLE.title,
    subtitle: typeof d.subtitle === 'string' ? d.subtitle : SAMPLE.subtitle,
    workers: workers.length > 0 ? workers : SAMPLE.workers,
  };
}

function StatusIcon({ status }: { status: WorkerStatus }) {
  if (status === 'done') return <CircleCheck size={15} color={Candle.success} />;
  if (status === 'running') return <Loader size={15} color={Candle.flame} />;
  return <Clock size={15} color={Candle.textTertiary} />;
}

function WorkerRow({ worker, divider }: { worker: Worker; divider: boolean }) {
  const meta = STATUS_META[worker.status];
  const pct = Math.round(worker.progress * 100);
  return (
    <View style={[styles.row, divider ? styles.rowDivider : null]}>
      <View style={styles.rowHead}>
        <StatusIcon status={worker.status} />
        <Text style={styles.name} numberOfLines={1}>
          {worker.name}
        </Text>
        <View style={[styles.pill, { backgroundColor: meta.fill }]}>
          <Text style={[styles.pillText, { color: meta.text }]} numberOfLines={1}>
            {meta.label}
          </Text>
        </View>
      </View>
      <Text style={styles.task} numberOfLines={1}>
        {worker.task}
      </Text>
      <View style={styles.progressRow}>
        <View style={styles.track}>
          <View
            style={[styles.fill, { width: `${pct}%`, backgroundColor: meta.bar }]}
          />
        </View>
        <Text style={styles.pct}>{pct}%</Text>
      </View>
    </View>
  );
}

export function WorkersBlock({ data }: { data?: unknown }) {
  const model = useMemo(() => normalize(data), [data]);
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.title}>{model.title}</Text>
          <Text style={styles.subtitle}>{model.subtitle}</Text>
        </View>
        <View style={styles.rows}>
          {model.workers.map((worker, i) => (
            <WorkerRow key={i} worker={worker} divider={i < model.workers.length - 1} />
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
  head: {
    gap: 2,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  subtitle: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11,
    color: Candle.textTertiary,
  },
  rows: {
    gap: 2,
  },
  row: {
    gap: 8,
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Candle.hairline,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontFamily: CandleFontFamilies.mono,
    fontSize: 12.5,
    color: Candle.textPrimary,
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  pillText: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 10,
    fontWeight: '600',
  },
  task: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12,
    color: Candle.textSecondary,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8DECF',
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  pct: {
    width: 38,
    textAlign: 'right',
    fontFamily: CandleFontFamilies.mono,
    fontSize: 11,
    color: Candle.textSecondary,
  },
});
