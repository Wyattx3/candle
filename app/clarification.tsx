/**
 * Clarification — a chat-style screen where the agent asks a follow-up question
 * before proceeding. Mirrors the Pencil `Screen · Clarification` node: Header,
 * a Conversation (user prompt → agent lead), and a docked COMPACT clarification
 * card with a question, radio option chips, and a free-text input row.
 */
import { useRouter } from 'expo-router';
import { ArrowUp, HelpCircle, MoreHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FlameMark } from '@/components/chat/FlameMark';
import { Header } from '@/components/chat/Header';
import { Candle, CandleFontFamilies } from '@/constants/theme';

interface ClarifyOption {
  id: string;
  title: string;
  sub: string;
}

const OPTIONS: ClarifyOption[] = [
  { id: 'minimal', title: 'Minimal & clean', sub: 'Lots of whitespace, simple type' },
  { id: 'bold', title: 'Bold & colorful', sub: 'Big gradients, playful shapes' },
  { id: 'corporate', title: 'Corporate & trustworthy', sub: 'Structured, professional tone' },
];

/** A single radio option chip. Compact padding to match the design. */
function OptionChip({
  option,
  selected,
  onPress,
}: {
  option: ClarifyOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.option, selected ? styles.optionSelected : styles.optionIdle]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.title}
    >
      <View
        style={[styles.radio, selected ? styles.radioSelected : styles.radioIdle]}
      >
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.optionTexts}>
        <Text style={styles.optionTitle}>{option.title}</Text>
        <Text style={styles.optionSub}>{option.sub}</Text>
      </View>
    </Pressable>
  );
}

export default function ClarificationScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string>('minimal');

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <Header onMenu={() => router.back()} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.conversation}
          showsVerticalScrollIndicator={false}
        >
          {/* User prompt */}
          <View style={styles.userRow}>
            <View style={styles.userBubble}>
              <Text style={styles.userText}>Build me a landing page for my new app.</Text>
            </View>
          </View>

          {/* Agent turn */}
          <View style={styles.agentTurn}>
            <View style={styles.headWrap}>
              <View style={styles.agentHead}>
                <FlameMark size={20} radius={6} />
                <Text style={styles.agentLabel}>Candle</Text>
              </View>
            </View>

            <View style={styles.leadWrap}>
              <Text style={styles.lead}>
                Happy to help. A couple of quick questions so I build the right thing:
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Dock — compact clarification card */}
        <View style={styles.dock}>
          <View style={styles.card}>
            <View style={styles.qHead}>
              <View style={styles.qIcon}>
                <HelpCircle size={15} color={Candle.flameDeep} />
              </View>
              <Text style={styles.qText}>What style are you going for?</Text>
            </View>

            <View style={styles.options}>
              {OPTIONS.map((opt) => (
                <OptionChip
                  key={opt.id}
                  option={opt}
                  selected={selected === opt.id}
                  onPress={() => setSelected(opt.id)}
                />
              ))}
            </View>

            <View style={styles.divider} />

            <View style={styles.inputRow}>
              <Pressable
                style={styles.moreBtn}
                accessibilityRole="button"
                accessibilityLabel="More options"
              >
                <MoreHorizontal size={20} color={Candle.textSecondary} />
              </Pressable>
              <Text style={styles.placeholder}>Or type your own answer…</Text>
              <Pressable
                style={styles.sendBtn}
                accessibilityRole="button"
                accessibilityLabel="Send answer"
              >
                <ArrowUp size={19} color="#FFFDF8" />
              </Pressable>
            </View>
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
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  conversation: {
    paddingTop: 10,
    gap: 16,
    paddingBottom: 16,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  userBubble: {
    backgroundColor: Candle.ink,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 230,
  },
  userText: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14,
    lineHeight: 14 * 1.4,
    color: '#FFFDF8',
  },
  agentTurn: {
    gap: 12,
  },
  headWrap: {
    paddingHorizontal: 20,
  },
  agentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  agentLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    color: Candle.textSecondary,
  },
  leadWrap: {
    paddingHorizontal: 20,
  },
  lead: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: Candle.textPrimary,
  },
  // Dock + compact card
  dock: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    gap: 7,
    borderRadius: 22,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 6,
    shadowColor: '#C8A06E',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  qHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  qIcon: {
    width: 24,
    height: 24,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qText: {
    flex: 1,
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  options: {
    gap: 5,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  optionSelected: {
    backgroundColor: Candle.accentSoft,
    borderColor: Candle.flame,
  },
  optionIdle: {
    backgroundColor: Candle.bgCanvas,
    borderColor: Candle.hairline,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderWidth: 1,
    borderColor: Candle.flame,
    backgroundColor: 'transparent',
  },
  radioIdle: {
    borderWidth: 1.5,
    borderColor: Candle.textTertiary,
  },
  radioDot: {
    width: 7.2,
    height: 7.2,
    borderRadius: 3.6,
    backgroundColor: Candle.flame,
  },
  optionTexts: {
    flex: 1,
    gap: 1,
  },
  optionTitle: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13.5,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  optionSub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11.5,
    color: Candle.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Candle.hairline,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
    paddingBottom: 2,
    paddingLeft: 2,
  },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    flex: 1,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14,
    color: Candle.textTertiary,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
