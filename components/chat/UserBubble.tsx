/**
 * UserBubble — a right-aligned ink bubble carrying the user's prompt text.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface UserBubbleProps {
  content: string;
}

export function UserBubble({ content }: UserBubbleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.bubble}>
        <Text style={styles.text}>{content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  bubble: {
    backgroundColor: Candle.ink,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 230,
  },
  text: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14,
    lineHeight: 14 * 1.4,
    color: Candle.textOnInk,
  },
});
