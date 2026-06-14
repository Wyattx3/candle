/**
 * Voice — full-screen voice session. Two soft radial glows behind a centered
 * animated flame orb (Skia port of orb.glsl), a LISTENING tag + live transcript,
 * a top bar (live timer pill + mute), and a bottom dock (captions / end-call /
 * mic). Presented as a full-screen modal. Pixel-faithful to the Pencil
 * `Screen · Voice` node.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Captions, Mic, Volume2, X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VoiceOrb } from '@/components/chat/VoiceOrb';
import { Candle, CandleFontFamilies } from '@/constants/theme';

export default function VoiceScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      {/* Soft radial glows (approximated with layered linear gradients) */}
      <LinearGradient
        colors={['#FFD89966', '#FBF6EF00']}
        style={[styles.glow, styles.glowA]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['#FF95003D', '#FBF6EF00']}
        style={[styles.glow, styles.glowB]}
        pointerEvents="none"
      />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.live}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>Voice · 0:14</Text>
          </View>
          <Pressable
            style={styles.muteBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Mute"
          >
            <Volume2 size={20} color={Candle.textSecondary} />
          </Pressable>
        </View>

        {/* Center */}
        <View style={styles.center}>
          <View style={styles.orbStage}>
            <VoiceOrb size={180} />
          </View>

          <View style={styles.texts}>
            <Text style={styles.tag}>LISTENING</Text>
            <Text style={styles.transcript}>
              “Research the top AI startups in Southeast Asia”
            </Text>
          </View>
        </View>

        {/* Dock */}
        <View style={styles.dockWrap}>
          <View style={styles.dock}>
            <Pressable
              style={styles.sideBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Captions"
            >
              <Captions size={24} color={Candle.textSecondary} />
            </Pressable>
            <Pressable
              style={styles.endBtn}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="End voice session"
            >
              <X size={28} color="#FFFDF8" />
            </Pressable>
            <Pressable
              style={styles.micBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Mic"
            >
              <Mic size={24} color={Candle.textOnAccent} />
            </Pressable>
          </View>
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
  glow: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowA: {
    width: 420,
    height: 420,
    left: -80,
    top: -60,
  },
  glowB: {
    width: 480,
    height: 480,
    left: 200,
    top: 520,
  },
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingHorizontal: 20,
  },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    borderRadius: 999,
    backgroundColor: Candle.glassRegular,
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    paddingHorizontal: 14,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Candle.danger,
  },
  liveLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13.5,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  muteBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Candle.glassRegular,
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
    paddingHorizontal: 36,
    paddingBottom: 20,
  },
  orbStage: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    alignItems: 'center',
    gap: 14,
  },
  tag: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: Candle.flameDeep,
  },
  transcript: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 25,
    fontWeight: '600',
    letterSpacing: -0.4,
    lineHeight: 25 * 1.35,
    textAlign: 'center',
    color: Candle.textPrimary,
  },
  dockWrap: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 40,
    backgroundColor: Candle.glassThick,
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    padding: 10,
    shadowColor: '#C8A06E',
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sideBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Candle.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C0341D',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  micBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
