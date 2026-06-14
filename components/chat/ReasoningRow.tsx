/**
 * ReasoningRow — a single line of the agent's "thinking" pane: a small dot
 * marker plus the indented reasoning text.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface ReasoningRowProps {
  content: string;
}

export function ReasoningRow({ content }: ReasoningRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.dot} />
      <Text style={styles.text}>{content.trim()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    gap: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: Candle.textTertiary,
  },
  text: {
    flex: 1,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 13,
    lineHeight: 13 * 1.45,
    color: Candle.textSecondary,
  },
});
