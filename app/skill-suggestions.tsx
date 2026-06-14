/**
 * Skill Suggestions — mined skill candidates pending review. Pixel-faithful to
 * the Pencil `Screen · Skill Suggestions` node: a nav bar with a flame "Mine"
 * pill, a mined-runs subheader, and a list of suggestion cards (cluster meta +
 * pending badge, name, description, mono tool sequence, tag pills, and reject/
 * approve actions). Cards blend into the canvas with hairline borders.
 */
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Zap } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface Suggestion {
  meta: string;
  name: string;
  desc: string;
  sequence: string;
  tags: string[];
}

const SUGGESTIONS: Suggestion[] = [
  {
    meta: 'cluster 8 · ~5 calls · 12.4s',
    name: 'Funding research → chart',
    desc: 'Search funding rounds, rank by growth, then render a bar chart of the results.',
    sequence: 'web_search → scrape → run_python → render_chart',
    tags: ['research', 'data-viz'],
  },
  {
    meta: 'cluster 5 · ~4 calls · 8.1s',
    name: 'PDF merge workflow',
    desc: 'Collect uploaded PDFs from the sandbox and merge them into a single document.',
    sequence: 'list_files → run_python → write_file',
    tags: ['files', 'pdf'],
  },
  {
    meta: 'cluster 4 · ~6 calls · 15.7s',
    name: 'Competitor scan digest',
    desc: 'Browse competitor sites, extract key updates, and summarize into a weekly digest.',
    sequence: 'browse_web → scrape → summarize',
    tags: ['research', 'monitoring'],
  },
];

export default function SkillSuggestionsScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* Nav bar */}
        <View style={styles.navBar}>
          <View style={styles.navLeft}>
            <Pressable
              style={styles.backBtn}
              hitSlop={8}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ArrowLeft size={21} color={Candle.textPrimary} />
            </Pressable>
            <Text style={styles.title}>Skill Suggestions</Text>
          </View>
          <Pressable
            style={styles.minePill}
            accessibilityRole="button"
            accessibilityLabel="Mine skills"
          >
            <Zap size={16} color={Candle.flameDeep} />
            <Text style={styles.mineLabel}>Mine</Text>
          </Pressable>
        </View>

        {/* Subheader */}
        <View style={styles.subBar}>
          <Text style={styles.subText}>Mined from 248 runs · 3 pending review</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {SUGGESTIONS.map((item) => (
            <View key={item.name} style={styles.card}>
              <View style={styles.top}>
                <Text style={styles.meta}>{item.meta}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>PENDING</Text>
                </View>
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc}>{item.desc}</Text>
              <View style={styles.seqWrap}>
                <Text style={styles.seq}>{item.sequence}</Text>
              </View>
              <View style={styles.tags}>
                {item.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagLabel}>{tag}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={styles.rejectBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject ${item.name}`}
                >
                  <Text style={styles.rejectLabel}>Reject</Text>
                </Pressable>
                <Pressable
                  style={styles.approveBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve and register ${item.name}`}
                >
                  <Check size={16} color="#FFFDF8" />
                  <Text style={styles.approveLabel}>Approve &amp; register</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 20,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: Candle.textPrimary,
  },
  minePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    backgroundColor: Candle.accentSoft,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  mineLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13,
    fontWeight: '700',
    color: Candle.flameDeep,
  },
  subBar: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  subText: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 13,
    color: Candle.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: 4,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: 'transparent',
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Candle.hairline,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: {
    fontFamily: CandleFontFamilies.mono,
    fontSize: 11,
    fontWeight: '500',
    color: Candle.textTertiary,
  },
  badge: {
    borderRadius: 999,
    backgroundColor: Candle.warningSoft,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  badgeLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Candle.warning,
  },
  name: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  desc: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 13,
    lineHeight: 13 * 1.4,
    color: Candle.textSecondary,
  },
  seqWrap: {
    borderRadius: 10,
    backgroundColor: Candle.surfaceSunken,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  seq: {
    fontFamily: CandleFontFamilies.mono,
    fontSize: 11.5,
    color: Candle.textSecondary,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    borderRadius: 8,
    backgroundColor: Candle.accentSoft,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  tagLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 11,
    fontWeight: '600',
    color: Candle.flameDeep,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  rejectBtn: {
    height: 38,
    borderRadius: 10,
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 38,
    borderRadius: 10,
    backgroundColor: Candle.flame,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFDF8',
  },
});
