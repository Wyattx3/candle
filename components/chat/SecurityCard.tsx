/**
 * SecurityCard — inline security notice raised by the agent's prompt/tool
 * scanners. Shows severity, where it was raised, and the detected labels.
 */
import { ShieldAlert } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';
import type { SecurityNode } from '@/hooks/chat-types';

interface SecurityCardProps {
  node: SecurityNode;
}

export function SecurityCard({ node }: SecurityCardProps) {
  const color = node.severity === 'high' ? Candle.danger : Candle.warning;
  const tint = node.severity === 'high' ? Candle.dangerSoft : Candle.warningSoft;
  const whereLabel = node.where === 'prompt' ? 'in your prompt' : 'in a tool result';

  return (
    <View style={[styles.card, { borderColor: color, backgroundColor: tint }]}>
      <View style={styles.header}>
        <ShieldAlert size={16} color={color} />
        <Text style={[styles.title, { color }]}>
          {node.severity === 'high' ? 'SECURITY ALERT' : 'SECURITY NOTICE'}
        </Text>
      </View>
      <Text style={styles.body}>
        Potentially unsafe content detected {whereLabel}.
      </Text>
      {node.labels.length > 0 ? (
        <View style={styles.labels}>
          {node.labels.map((label) => (
            <View key={label} style={styles.chip}>
              <Text style={styles.chipText}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  body: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.45,
    color: Candle.textSecondary,
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderRadius: 8,
    backgroundColor: Candle.bgElevated,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  chipText: {
    fontFamily: CandleFontFamilies.mono,
    fontSize: 11,
    color: Candle.textSecondary,
  },
});
