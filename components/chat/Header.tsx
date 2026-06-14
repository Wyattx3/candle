/**
 * Header — the floating top bar shared by Home and Chat: a round menu button,
 * a centered "Candle" pill with a chevron, and a round "new chat" button. All
 * three use the warm glass treatment from the Pencil design.
 */
import { AlignLeft, ChevronDown, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface HeaderProps {
  title?: string;
  onMenu?: () => void;
  onNew?: () => void;
  onTitle?: () => void;
}

export function Header({ title = 'Candle', onMenu, onNew, onTitle }: HeaderProps) {
  return (
    <View style={styles.row}>
      <Pressable style={styles.roundBtn} hitSlop={8} onPress={onMenu} accessibilityRole="button" accessibilityLabel="Menu">
        <AlignLeft size={20} color={Candle.textPrimary} />
      </Pressable>

      <Pressable style={styles.pill} hitSlop={6} onPress={onTitle} accessibilityRole="button" accessibilityLabel={title}>
        <Text style={styles.pillText}>{title}</Text>
        <ChevronDown size={17} color={Candle.textSecondary} />
      </Pressable>

      <Pressable style={styles.roundBtn} hitSlop={8} onPress={onNew} accessibilityRole="button" accessibilityLabel="New chat">
        <Plus size={20} color={Candle.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Candle.glassRegular,
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    borderRadius: 21,
    backgroundColor: Candle.glassRegular,
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    paddingHorizontal: 18,
  },
  pillText: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
});
