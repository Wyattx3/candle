/**
 * Onboarding — first-run sign-in. Centered flame hero with headline + tagline,
 * and a docked stack of provider buttons (Apple, Google) plus a terms note.
 * Mirrors the Pencil `Screen · Onboarding` node.
 */
import { useRouter } from 'expo-router';
import { Apple, Globe } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FlameMark } from '@/components/chat/FlameMark';
import { Candle, CandleFontFamilies } from '@/constants/theme';

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={styles.hero}>
          <FlameMark size={120} radius={36} shadow />

          <View style={styles.texts}>
            <Text style={styles.title}>Meet Candle</Text>
            <Text style={styles.sub}>
              Your AI agent that browses the web, runs code, and gets real work done.
            </Text>
          </View>
        </View>

        <View style={styles.dock}>
          <Pressable
            style={styles.appleBtn}
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
          >
            <Apple size={22} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.appleLabel}>Continue with Apple</Text>
          </Pressable>

          <Pressable
            style={styles.googleBtn}
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <Globe size={22} color={Candle.textSecondary} />
            <Text style={styles.googleLabel}>Continue with Google</Text>
          </Pressable>

          <Text style={styles.terms}>
            By continuing you agree to our Terms &amp; Privacy Policy
          </Text>
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
  dock: {
    gap: 14,
    paddingHorizontal: 24,
    paddingBottom: 44,
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 16,
    backgroundColor: Candle.ink,
  },
  appleLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 16,
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
  },
  googleLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  terms: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.4,
    textAlign: 'center',
    color: Candle.textTertiary,
  },
});
