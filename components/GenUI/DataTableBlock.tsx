/**
 * DataTableBlock — an inline GenUI data table rendered in the chat stream.
 * Mirrors the Pencil `GenUI/2 · Tables & Data Exploration` "Sortable /
 * filterable table" cell: a warm-canvas card with a sunken header row, body
 * rows separated by hairlines, right-aligned numeric columns, and optional
 * status pills. Pure presentational; falls back to SAMPLE data when `data` is
 * missing or malformed.
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

type PillTone = 'success' | 'warning' | 'danger' | 'neutral';

interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  pill?: boolean;
}

interface TableData {
  title: string;
  columns: Column[];
  rows: Record<string, { text: string; tone?: PillTone }>[];
}

const SAMPLE: TableData = {
  title: 'Customers',
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'plan', label: 'Plan' },
    { key: 'mrr', label: 'MRR', numeric: true },
    { key: 'status', label: 'Status', pill: true },
  ],
  rows: [
    { name: { text: 'Acme Corp' }, plan: { text: 'Pro' }, mrr: { text: '$1,240' }, status: { text: 'Active', tone: 'success' } },
    { name: { text: 'Globex' }, plan: { text: 'Team' }, mrr: { text: '$680' }, status: { text: 'Active', tone: 'success' } },
    { name: { text: 'Initech' }, plan: { text: 'Free' }, mrr: { text: '$0' }, status: { text: 'Trial', tone: 'warning' } },
    { name: { text: 'Umbrella' }, plan: { text: 'Pro' }, mrr: { text: '$1,240' }, status: { text: 'Churned', tone: 'danger' } },
    { name: { text: 'Soylent' }, plan: { text: 'Team' }, mrr: { text: '$540' }, status: { text: 'Active', tone: 'success' } },
  ],
};

const PILL_FILL: Record<PillTone, string> = {
  success: Candle.successSoft,
  warning: Candle.warningSoft,
  danger: Candle.dangerSoft,
  neutral: Candle.surfaceSunken,
};

const PILL_TEXT: Record<PillTone, string> = {
  success: Candle.success,
  warning: Candle.warning,
  danger: Candle.danger,
  neutral: Candle.textSecondary,
};

function isTone(v: unknown): v is PillTone {
  return v === 'success' || v === 'warning' || v === 'danger' || v === 'neutral';
}

/** Coerce an unknown payload into safe TableData. */
function normalize(data: unknown): TableData {
  if (!data || typeof data !== 'object') return SAMPLE;
  const d = data as Record<string, unknown>;

  const columns = Array.isArray(d.columns)
    ? (d.columns as unknown[])
        .map((c): Column | null => {
          const r = c as Record<string, unknown>;
          if (!r || typeof r !== 'object' || typeof r.key !== 'string') return null;
          return {
            key: r.key,
            label: typeof r.label === 'string' ? r.label : r.key,
            numeric: typeof r.numeric === 'boolean' ? r.numeric : false,
            pill: typeof r.pill === 'boolean' ? r.pill : false,
          };
        })
        .filter((c): c is Column => c !== null)
    : [];

  if (columns.length === 0) return SAMPLE;

  const rows = Array.isArray(d.rows)
    ? (d.rows as unknown[])
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const r = row as Record<string, unknown>;
          const out: Record<string, { text: string; tone?: PillTone }> = {};
          for (const col of columns) {
            const cell = r[col.key];
            if (cell && typeof cell === 'object') {
              const cr = cell as Record<string, unknown>;
              out[col.key] = {
                text: typeof cr.text === 'string' ? cr.text : '',
                tone: isTone(cr.tone) ? cr.tone : undefined,
              };
            } else {
              out[col.key] = { text: cell == null ? '' : String(cell) };
            }
          }
          return out;
        })
        .filter((r): r is Record<string, { text: string; tone?: PillTone }> => r !== null)
    : [];

  return { title: typeof d.title === 'string' ? d.title : SAMPLE.title, columns, rows };
}

function Cell({ col, cell }: { col: Column; cell?: { text: string; tone?: PillTone } }) {
  const text = cell?.text ?? '';
  if (col.pill) {
    const tone: PillTone = cell?.tone ?? 'neutral';
    return (
      <View style={styles.cell}>
        <View style={[styles.pill, { backgroundColor: PILL_FILL[tone] }]}>
          <Text style={[styles.pillText, { color: PILL_TEXT[tone] }]} numberOfLines={1}>
            {text}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.cell, col.numeric ? styles.cellNumeric : null]}>
      <Text
        style={[styles.cellText, col.numeric ? styles.cellTextNumeric : null]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

export function DataTableBlock({ data }: { data?: unknown }) {
  const model = useMemo(() => normalize(data), [data]);
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled style={styles.scroll}>
          {/* Header row */}
          <View style={styles.headRow}>
            {model.columns.map((col) => (
              <View
                key={col.key}
                style={[styles.headCell, col.numeric ? styles.cellNumeric : null]}
              >
                <Text
                  style={[styles.headLabel, col.numeric ? styles.cellTextNumeric : null]}
                  numberOfLines={1}
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Body rows */}
          {model.rows.map((row, ri) => (
            <View
              key={ri}
              style={[styles.bodyRow, ri < model.rows.length - 1 ? styles.rowDivider : null]}
            >
              {model.columns.map((col) => (
                <Cell key={col.key} col={col} cell={row[col.key]} />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  card: {
    borderRadius: 16,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    overflow: 'hidden',
  },
  scroll: {
    maxHeight: 290,
  },
  headRow: {
    flexDirection: 'row',
    backgroundColor: Candle.surfaceSunken,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  headCell: {
    flex: 1,
    justifyContent: 'center',
  },
  headLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 11.5,
    fontWeight: '700',
    color: Candle.textSecondary,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Candle.hairline,
  },
  cell: {
    flex: 1,
    justifyContent: 'center',
  },
  cellNumeric: {
    alignItems: 'flex-end',
  },
  cellText: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12.5,
    fontWeight: '500',
    color: Candle.textPrimary,
  },
  cellTextNumeric: {
    fontFamily: CandleFontFamilies.mono,
    textAlign: 'right',
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  pillText: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 10.5,
    fontWeight: '600',
  },
});
