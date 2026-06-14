/**
 * ReportCard — the "DEEP RESEARCH REPORT" card from the Pencil design. It is a
 * presentational block kept ready for a future `report`/`genui` stream node;
 * it accepts its content via props so the agent turn can render it once the
 * backend emits a matching event.
 */
import { Clock, FileText, Globe, Link } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

const REPORT_ORANGE = '#E8930F';

export interface ReportData {
  title: string;
  summary: string;
  pages: string;
  sources: string;
  duration: string;
}

interface ReportCardProps {
  data: ReportData;
}

export function ReportCard({ data }: ReportCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Globe size={20} color={REPORT_ORANGE} />
        <Text style={styles.kicker}>DEEP RESEARCH REPORT</Text>
      </View>

      <Text style={styles.title}>{data.title}</Text>
      <Text style={styles.summary}>{data.summary}</Text>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <FileText size={14} color={Candle.textTertiary} />
          <Text style={styles.metaLabel}>{data.pages}</Text>
        </View>
        <View style={styles.metaItem}>
          <Link size={14} color={Candle.textTertiary} />
          <Text style={styles.metaLabel}>{data.sources}</Text>
        </View>
        <View style={styles.metaItem}>
          <Clock size={14} color={Candle.textTertiary} />
          <Text style={styles.metaLabel}>{data.duration}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kicker: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: Candle.textTertiary,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 18,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  summary: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: Candle.textSecondary,
  },
  meta: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Candle.hairline,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 11.5,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
});
