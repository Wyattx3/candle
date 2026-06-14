/**
 * Connection Lost — full-bleed error state shown when the agent socket drops.
 * A danger glow icon, headline + reassurance copy, a reconnecting status pill,
 * and a docked Retry / New chat action pair. Mirrors the Pencil
 * `Screen · Connection Lost` node.
 */
import { useRouter } from 'expo-router';
import { LoaderCircle, RefreshCw, WifiOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

export default function ConnectionLostScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={styles.hero}>
          <View style={styles.glow}>
            <WifiOff size={48} color={Candle.danger} />
          </View>

          <View style={styles.texts}>
            <Text style={styles.title}>Connection lost</Text>
            <Text style={styles.sub}>
              Candle couldn&apos;t reach the agent. Check your connection — your chat is saved and
              will resume.
            </Text>

            <View style={styles.statusPill}>
              <LoaderCircle size={15} color={Candle.warning} />
              <Text style={styles.statusLabel}>Reconnecting · attempt 3</Text>
            </View>
          </View>
        </View>

        <View style={styles.dock}>
          <Pressable
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry now"
          >
            <RefreshCw size={19} color={Candle.textOnInk} />
            <Text style={styles.retryLabel}>Retry now</Text>
          </Pressable>

          <Pressable
            style={styles.newChatBtn}
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
          >
            <Text style={styles.newChatLabel}>Start a new chat</Text>
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
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    paddingHorizontal: 40,
  },
  glow: {
    width: 104,
    height: 104,
    borderRadius: 32,
    backgroundColor: Candle.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    textAlign: 'center',
    color: Candle.textPrimary,
  },
  sub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 16.5,
    lineHeight: 16.5 * 1.5,
    textAlign: 'center',
    color: Candle.textSecondary,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  statusLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
  dock: {
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 44,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: Candle.flame,
    shadowColor: Candle.flameDeep,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  retryLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: Candle.textOnInk,
  },
  newChatBtn: {
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  newChatLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
});
