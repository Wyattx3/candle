/**
 * Settings — account profile card plus grouped preference sections (Agent,
 * Privacy & Safety, About). Nav rows push deeper screens; toggle rows flip a
 * local switch. Pixel-faithful to the Pencil `Screen · Settings` node.
 */
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Bolt,
    ChevronRight,
    FileText,
    Info,
    LogOut,
    Shield,
    type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FlameMark } from '@/components/chat/FlameMark';
import { Candle, CandleFontFamilies } from '@/constants/theme';

/** A small on/off pill switch matching the Pencil 50×30 toggle. */
function Toggle({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      style={[styles.toggleTrack, value ? styles.toggleOn : styles.toggleOff]}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={[styles.toggleKnob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

function NavRow({
  icon: Icon,
  label,
  danger,
  showBorder,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  showBorder?: boolean;
  onPress?: () => void;
}) {
  const tint = danger ? Candle.danger : Candle.textSecondary;
  return (
    <Pressable
      style={[styles.row, showBorder ? styles.rowBorder : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={20} color={tint} />
      <Text style={[styles.rowLabel, danger ? { color: Candle.danger } : null]}>{label}</Text>
      {!danger ? <ChevronRight size={18} color={Candle.textTertiary} /> : null}
    </Pressable>
  );
}

function ToggleRow({
  title,
  sub,
  value,
  onValueChange,
  showBorder,
}: {
  title: string;
  sub: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  showBorder?: boolean;
}) {
  return (
    <View style={[styles.row, styles.toggleRow, showBorder ? styles.rowBorder : null]}>
      <View style={styles.toggleTexts}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <Toggle value={value} onValueChange={onValueChange} label={title} />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [webSearch, setWebSearch] = useState(true);
  const [autoLearn, setAutoLearn] = useState(true);
  const [injectionGuard, setInjectionGuard] = useState(true);
  const [saveHistory, setSaveHistory] = useState(true);

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
          <Text style={styles.title}>Settings</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile */}
          <View style={styles.profileCard}>
            <FlameMark size={50} radius={25} shadow />
            <View style={styles.profileTexts}>
              <Text style={styles.profileName}>Aung Min</Text>
              <Text style={styles.profileEmail}>aung@candle.app</Text>
            </View>
            <View style={styles.proBadge}>
              <Text style={styles.proLabel}>PRO</Text>
            </View>
          </View>

          {/* Agent */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>AGENT</Text>
            <NavRow
              icon={Bolt}
              label="Default model"
              showBorder
              onPress={() => router.push('/model-picker')}
            />
            <ToggleRow
              title="Web search"
              sub="Allow live browsing"
              value={webSearch}
              onValueChange={setWebSearch}
              showBorder
            />
            <ToggleRow
              title="Auto-learn skills"
              sub="Capture reusable workflows"
              value={autoLearn}
              onValueChange={setAutoLearn}
            />
          </View>

          {/* Privacy & Safety */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PRIVACY &amp; SAFETY</Text>
            <NavRow icon={Shield} label="Command approvals" showBorder />
            <ToggleRow
              title="Prompt-injection guard"
              sub="Treat suspicious text as untrusted"
              value={injectionGuard}
              onValueChange={setInjectionGuard}
              showBorder
            />
            <ToggleRow
              title="Save chat history"
              sub="Keep conversations on device"
              value={saveHistory}
              onValueChange={setSaveHistory}
            />
          </View>

          {/* About */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ABOUT</Text>
            <NavRow icon={Info} label="Version" showBorder />
            <NavRow icon={FileText} label="Terms &amp; Privacy" showBorder />
            <NavRow icon={LogOut} label="Sign out" danger />
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
    paddingBottom: 8,
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
    paddingHorizontal: 18,
    paddingBottom: 32,
    gap: 14,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 2,
  },
  profileTexts: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Candle.textPrimary,
  },
  profileEmail: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 13.5,
    color: Candle.textTertiary,
  },
  proBadge: {
    borderRadius: 999,
    backgroundColor: Candle.accentSoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  proLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12.5,
    fontWeight: '700',
    color: Candle.flameDeep,
  },
  section: {
    gap: 2,
  },
  sectionLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: Candle.textTertiary,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Candle.hairline,
  },
  rowLabel: {
    flex: 1,
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 14,
    fontWeight: '500',
    color: Candle.textPrimary,
  },
  toggleRow: {
    justifyContent: 'space-between',
  },
  toggleTexts: {
    flex: 1,
    gap: 1,
  },
  toggleTitle: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 14,
    fontWeight: '500',
    color: Candle.textPrimary,
  },
  toggleSub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11.5,
    color: Candle.textTertiary,
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
  },
  knobOn: {
    backgroundColor: Candle.textOnInk,
  },
  knobOff: {
    backgroundColor: Candle.bgElevated,
  },
});
