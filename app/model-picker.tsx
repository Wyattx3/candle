/**
 * Model Picker — choose the default LLM for new chats. A radio list grouped by
 * provider (Cloudflare Workers AI + Failover); the selected card gets a flame
 * border + check badge. Pixel-faithful to the Pencil `Screen · Model Picker`.
 */
import { useRouter } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface ModelOption {
  id: string;
  name: string;
  description: string;
  tag?: { label: string; color: string; bg: string };
}

const CLOUDFLARE_MODELS: ModelOption[] = [
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    description: 'MoonshotAI · fast tool-calling, great for agents',
    tag: { label: 'DEFAULT', color: Candle.flameDeep, bg: Candle.accentSoft },
  },
  {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    description: 'Meta · balanced reasoning and speed',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    description: 'Step-by-step reasoning for complex tasks',
    tag: { label: 'REASONING', color: Candle.success, bg: Candle.successSoft },
  },
];

const FAILOVER_MODELS: ModelOption[] = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    description: 'OpenAI · secondary provider when primary is rate-limited',
  },
];

function ModelCard({
  option,
  selected,
  onPress,
}: {
  option: ModelOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.card, selected ? styles.cardSelected : styles.cardUnselected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.name}
    >
      <View style={styles.cardTexts}>
        <View style={styles.cardTop}>
          <Text style={styles.cardName}>{option.name}</Text>
          {option.tag ? (
            <View style={[styles.tag, { backgroundColor: option.tag.bg }]}>
              <Text style={[styles.tagLabel, { color: option.tag.color }]}>{option.tag.label}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardDesc}>{option.description}</Text>
      </View>
      {selected ? (
        <View style={styles.check}>
          <Check size={15} color={Candle.textOnInk} strokeWidth={3} />
        </View>
      ) : (
        <View style={styles.radio} />
      )}
    </Pressable>
  );
}

export default function ModelPickerScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState('kimi-k2.6');

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.navBar}>
          <Pressable
            style={styles.backBtn}
            hitSlop={8}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={21} color={Candle.textPrimary} />
          </Pressable>
          <Text style={styles.title}>Default Model</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Pick the model Candle uses for new chats. You can override per session.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CLOUDFLARE WORKERS AI</Text>
            <View style={styles.list}>
              {CLOUDFLARE_MODELS.map((model) => (
                <ModelCard
                  key={model.id}
                  option={model}
                  selected={selected === model.id}
                  onPress={() => setSelected(model.id)}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FAILOVER</Text>
            <View style={styles.list}>
              {FAILOVER_MODELS.map((model) => (
                <ModelCard
                  key={model.id}
                  option={model}
                  selected={selected === model.id}
                  onPress={() => setSelected(model.id)}
                />
              ))}
            </View>
          </View>
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
    gap: 14,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 20,
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
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  intro: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14,
    lineHeight: 14 * 1.45,
    color: Candle.textSecondary,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Candle.textTertiary,
  },
  list: {
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  cardSelected: {
    backgroundColor: Candle.accentSoft,
    borderWidth: 1,
    borderColor: Candle.flame,
  },
  cardUnselected: {
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
  },
  cardTexts: {
    flex: 1,
    gap: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 15.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  tag: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  tagLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  cardDesc: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12.5,
    color: Candle.textSecondary,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Candle.textTertiary,
    backgroundColor: 'transparent',
  },
});
