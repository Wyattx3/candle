/**
 * New Task — form to schedule a recurring agent job: task name, the prompt for
 * Candle, a repeat chip group (Daily / Weekly / Monthly / Once), a time picker
 * row, a notify toggle, and a flame "Create task" dock button. Pixel-faithful
 * to the Pencil `Screen · New Task` node.
 */
import { useRouter } from 'expo-router';
import { Check, ChevronDown, Clock, X } from 'lucide-react-native';
import { useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Once'] as const;
type Frequency = (typeof FREQUENCIES)[number];

/** The 50×30 notify toggle in the footer card. */
function NotifyToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={[styles.toggleTrack, on ? styles.toggleOn : styles.toggleOff]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Notify on completion"
    >
      <View style={styles.toggleKnob} />
    </Pressable>
  );
}

export default function NewTaskScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('Daily');
  const [notify, setNotify] = useState(true);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={styles.navBar}>
          <Pressable
            style={styles.backBtn}
            hitSlop={8}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={21} color={Candle.textPrimary} />
          </Pressable>
          <Text style={styles.title}>New Task</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Task name */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>TASK NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Daily news digest"
              placeholderTextColor={Candle.textTertiary}
            />
          </View>

          {/* Prompt */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>WHAT SHOULD CANDLE DO?</Text>
            <TextInput
              style={styles.textArea}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Summarize the top AI headlines and email me a digest."
              placeholderTextColor={Candle.textTertiary}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Repeat */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>REPEAT</Text>
            <View style={styles.chips}>
              {FREQUENCIES.map((freq) => {
                const active = frequency === freq;
                return (
                  <Pressable
                    key={freq}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                    onPress={() => setFrequency(freq)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={freq}
                  >
                    <Text style={active ? styles.chipLabelActive : styles.chipLabel}>{freq}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Time */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>TIME</Text>
            <Pressable
              style={styles.timeRow}
              accessibilityRole="button"
              accessibilityLabel="Time, 8:00 AM"
            >
              <Clock size={20} color={Candle.flame} />
              <Text style={styles.timeValue}>8:00 AM</Text>
              <ChevronDown size={20} color={Candle.textTertiary} />
            </Pressable>
          </View>

          {/* Notify */}
          <View style={styles.notifyCard}>
            <View style={styles.notifyTexts}>
              <Text style={styles.notifyTitle}>Notify on completion</Text>
              <Text style={styles.notifySub}>Push a summary when the run finishes</Text>
            </View>
            <NotifyToggle on={notify} onToggle={() => setNotify((v) => !v)} />
          </View>
        </ScrollView>

        <View style={styles.dock}>
          <Pressable
            style={styles.createBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Create task"
          >
            <Check size={19} color="#FFFDF8" />
            <Text style={styles.createLabel}>Create task</Text>
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
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 18,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Candle.textTertiary,
  },
  input: {
    height: 48,
    borderRadius: 13,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingHorizontal: 14,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 15,
    color: Candle.textPrimary,
  },
  textArea: {
    height: 96,
    borderRadius: 13,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 15,
    lineHeight: 15 * 1.45,
    color: Candle.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: Candle.accentSoft,
    borderColor: Candle.flame,
  },
  chipInactive: {
    backgroundColor: Candle.bgCanvas,
    borderColor: Candle.hairline,
  },
  chipLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 13.5,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  chipLabelActive: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13.5,
    fontWeight: '700',
    color: Candle.flameDeep,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 13,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  timeValue: {
    flex: 1,
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  notifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  notifyTexts: {
    flex: 1,
    gap: 2,
  },
  notifyTitle: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  notifySub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12.5,
    color: Candle.textSecondary,
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: Candle.flame,
    justifyContent: 'flex-end',
  },
  toggleOff: {
    backgroundColor: Candle.surfaceSunken,
    justifyContent: 'flex-start',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFDF8',
  },
  dock: {
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: Candle.flame,
  },
  createLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFDF8',
  },
});
