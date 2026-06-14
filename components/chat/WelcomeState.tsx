/**
 * WelcomeState — the Home empty state: hero flame mark + greeting, a list of
 * suggested prompts, and a row of capability chips. Tapping a suggested row
 * sends that prompt through `onPickPrompt`.
 */
import {
    ArrowUpRight,
    ChartLine,
    Code,
    FileText,
    Globe,
    Search,
    Terminal,
    type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';
import { FlameMark } from './FlameMark';

interface WelcomeStateProps {
  onPickPrompt: (prompt: string) => void;
}

interface Suggestion {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  sub: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: Search,
    iconColor: Candle.flame,
    title: 'Market research',
    sub: 'Analyze tech trends across SEA',
    prompt: 'Do market research and analyze tech trends across Southeast Asia.',
  },
  {
    icon: ChartLine,
    iconColor: Candle.success,
    title: 'Visualize data',
    sub: 'Build charts from a CSV file',
    prompt: 'Help me visualize data and build charts from a CSV file.',
  },
  {
    icon: Code,
    iconColor: Candle.ember,
    title: 'Write code',
    sub: 'Generate a React component',
    prompt: 'Write code to generate a React component.',
  },
];

interface Capability {
  icon: LucideIcon;
  label: string;
}

const CAPABILITIES: Capability[] = [
  { icon: Globe, label: 'Search web' },
  { icon: Terminal, label: 'Run code' },
  { icon: FileText, label: 'Draft docs' },
];

export function WelcomeState({ onPickPrompt }: WelcomeStateProps) {
  return (
    <View style={styles.body}>
      {/* Hero */}
      <View style={styles.hero}>
        <FlameMark size={54} radius={17} shadow />
        <View style={styles.greeting}>
          <Text style={styles.greetTitle}>Good evening</Text>
          <Text style={styles.greetSub}>
            What can I help you build, research, or automate today?
          </Text>
        </View>
      </View>

      {/* Suggested */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SUGGESTED</Text>
        <View style={styles.cards}>
          {SUGGESTIONS.map((item, index) => {
            const Icon = item.icon;
            const isLast = index === SUGGESTIONS.length - 1;
            return (
              <Pressable
                key={item.title}
                style={[styles.cardRow, isLast ? null : styles.cardRowBorder]}
                onPress={() => onPickPrompt(item.prompt)}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View style={[styles.well, { backgroundColor: Candle.accentSoft }]}>
                  <Icon size={20} color={item.iconColor} />
                </View>
                <View style={styles.cardTexts}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSub}>{item.sub}</Text>
                </View>
                <ArrowUpRight size={18} color={Candle.textTertiary} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Capabilities */}
      <View style={styles.capSection}>
        <Text style={styles.sectionLabel}>CANDLE CAN</Text>
        <View style={styles.chips}>
          {CAPABILITIES.map((cap) => {
            const Icon = cap.icon;
            return (
              <View key={cap.label} style={styles.chip}>
                <Icon size={19} color={Candle.textSecondary} />
                <Text style={styles.chipLabel}>{cap.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: 24,
    gap: 26,
  },
  hero: {
    paddingHorizontal: 20,
    gap: 16,
  },
  greeting: {
    gap: 7,
  },
  greetTitle: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 31,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 31 * 1.12,
    color: Candle.textPrimary,
  },
  greetSub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 16,
    lineHeight: 16 * 1.4,
    color: Candle.textSecondary,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Candle.textTertiary,
    paddingHorizontal: 20,
  },
  cards: {
    paddingHorizontal: 20,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
  },
  cardRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Candle.hairline,
  },
  well: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTexts: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.1,
    color: Candle.textPrimary,
  },
  cardSub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 13,
    color: Candle.textSecondary,
  },
  capSection: {
    paddingHorizontal: 20,
    gap: 10,
  },
  chips: {
    flexDirection: 'row',
    gap: 9,
  },
  chip: {
    flex: 1,
    borderRadius: 15,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 14,
    gap: 9,
  },
  chipLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 13,
    fontWeight: '500',
    color: Candle.textPrimary,
  },
});
