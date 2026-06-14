/**
 * Skill Detail — a single learned skill: a header with icon/title/description
 * and tag pills, a three-up stats row, a numbered workflow list, and a pinned
 * "Run skill" dock at the bottom. Pixel-faithful to the Pencil `Screen · Skill
 * Detail` node. Cards blend into the canvas with hairline borders.
 */
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    FileText,
    Filter,
    LineChart,
    MoreHorizontal,
    Play,
    SearchCheck,
    TrendingUp,
    type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

const TAGS = ['research', 'data-viz', 'auto'];

interface Stat {
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { value: '47×', label: 'Used' },
  { value: '2m 14s', label: 'Avg time' },
  { value: '96%', label: 'Success' },
];

interface Step {
  icon: LucideIcon;
  text: string;
}

const STEPS: Step[] = [
  { icon: SearchCheck, text: 'Search recent funding rounds' },
  { icon: Filter, text: 'Filter and rank by growth rate' },
  { icon: TrendingUp, text: 'Render a comparison chart' },
  { icon: FileText, text: 'Summarize the findings' },
];

export default function SkillDetailScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        {/* Nav bar */}
        <View style={styles.navBar}>
          <Pressable
            style={styles.roundBtn}
            hitSlop={8}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={21} color={Candle.textPrimary} />
          </Pressable>
          <Pressable
            style={styles.roundBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <MoreHorizontal size={21} color={Candle.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {/* Head */}
          <View style={styles.head}>
            <LineChart size={42} color={Candle.flameDeep} />
            <Text style={styles.headTitle}>Funding research → chart</Text>
            <Text style={styles.headDesc}>
              Search funding rounds, rank companies by growth rate, and render a
              comparison chart.
            </Text>
            <View style={styles.tags}>
              {TAGS.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagLabel}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Stats */}
          <View style={styles.stats}>
            {STATS.map((stat) => (
              <View key={stat.label} style={styles.statCol}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Workflow */}
          <View style={styles.steps}>
            <Text style={styles.workflowLabel}>WORKFLOW</Text>
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isLast = index === STEPS.length - 1;
              return (
                <View
                  key={step.text}
                  style={[styles.step, isLast ? null : styles.stepBorder]}
                >
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{index + 1}</Text>
                  </View>
                  <Icon size={20} color={Candle.textSecondary} />
                  <Text style={styles.stepText}>{step.text}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Dock */}
        <View style={styles.dock}>
          <Pressable
            style={styles.runBtn}
            accessibilityRole="button"
            accessibilityLabel="Run skill"
          >
            <Play size={22} color={Candle.textOnAccent} />
            <Text style={styles.runLabel}>Run skill</Text>
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 20,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 18,
  },
  head: {
    gap: 12,
  },
  headTitle: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 26 * 1.15,
    color: Candle.textPrimary,
  },
  headDesc: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: Candle.textSecondary,
  },
  tags: {
    flexDirection: 'row',
    gap: 8,
  },
  tag: {
    borderRadius: 999,
    backgroundColor: Candle.surfaceSunken,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  tagLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 12.5,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Candle.hairline,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Candle.textPrimary,
  },
  statLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12.5,
    fontWeight: '500',
    color: Candle.textTertiary,
  },
  steps: {
    gap: 2,
  },
  workflowLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: Candle.textTertiary,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 2,
  },
  stepBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Candle.hairline,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Candle.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13,
    fontWeight: '700',
    color: Candle.flameDeep,
  },
  stepText: {
    flex: 1,
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 15,
    fontWeight: '500',
    color: Candle.textPrimary,
  },
  dock: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  runBtn: {
    flexDirection: 'row',
    height: 54,
    borderRadius: 16,
    backgroundColor: Candle.flame,
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Candle.flameDeep,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  runLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16.5,
    fontWeight: '700',
    color: Candle.textOnAccent,
  },
});
