/**
 * Add MCP Server — form to connect a new external tool server: a transport
 * segmented control (stdio / SSE / HTTP), name + command + env inputs, an
 * auto-approve toggle, and a flame "Connect server" dock button. Pixel-faithful
 * to the Pencil `Screen · Add MCP Server` node.
 */
import { useRouter } from 'expo-router';
import { Cable, X } from 'lucide-react-native';
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

const TRANSPORTS = ['stdio', 'SSE', 'HTTP'] as const;
type Transport = (typeof TRANSPORTS)[number];

/** The 50×30 auto-approve toggle in the footer card. */
function AutoToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={[styles.toggleTrack, on ? styles.toggleOn : styles.toggleOff]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Auto-approve tools"
    >
      <View style={styles.toggleKnob} />
    </Pressable>
  );
}

export default function AddMcpServerScreen() {
  const router = useRouter();
  const [transport, setTransport] = useState<Transport>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [env, setEnv] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);

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
          <Text style={styles.title}>Add Server</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Connect an external MCP server to give Candle new tools.
          </Text>

          {/* Transport */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>TRANSPORT</Text>
            <View style={styles.segment}>
              {TRANSPORTS.map((t) => {
                const active = transport === t;
                return (
                  <Pressable
                    key={t}
                    style={[styles.segmentItem, active ? styles.segmentActive : null]}
                    onPress={() => setTransport(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t}
                  >
                    <Text style={active ? styles.segmentLabelActive : styles.segmentLabel}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="my-tool-server"
              placeholderTextColor={Candle.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Command */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>COMMAND</Text>
            <TextInput
              style={[styles.input, styles.inputMono]}
              value={command}
              onChangeText={setCommand}
              placeholder="npx @mcp/server-filesystem"
              placeholderTextColor={Candle.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Env variables */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>ENV VARIABLES</Text>
            <TextInput
              style={[styles.textArea, styles.inputMono]}
              value={env}
              onChangeText={setEnv}
              placeholder={'API_KEY=sk-…\nBASE_URL=https://…'}
              placeholderTextColor={Candle.textTertiary}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
            />
          </View>

          {/* Auto-approve */}
          <View style={styles.autoCard}>
            <View style={styles.autoTexts}>
              <Text style={styles.autoTitle}>Auto-approve tools</Text>
              <Text style={styles.autoSub}>Run this server&apos;s tools without asking</Text>
            </View>
            <AutoToggle on={autoApprove} onToggle={() => setAutoApprove((v) => !v)} />
          </View>
        </ScrollView>

        <View style={styles.dock}>
          <Pressable
            style={styles.connectBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Connect server"
          >
            <Cable size={19} color="#FFFDF8" />
            <Text style={styles.connectLabel}>Connect server</Text>
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
  intro: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14,
    lineHeight: 14 * 1.45,
    color: Candle.textSecondary,
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
  segment: {
    flexDirection: 'row',
    gap: 4,
    borderRadius: 12,
    backgroundColor: Candle.surfaceSunken,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentActive: {
    backgroundColor: Candle.bgCanvas,
    borderColor: Candle.hairline,
  },
  segmentLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 13.5,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  segmentLabelActive: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 13.5,
    fontWeight: '700',
    color: Candle.textPrimary,
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
  inputMono: {
    fontFamily: CandleFontFamilies.mono,
    fontSize: 13,
  },
  textArea: {
    height: 84,
    borderRadius: 13,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: Candle.textPrimary,
  },
  autoCard: {
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
  autoTexts: {
    flex: 1,
    gap: 2,
  },
  autoTitle: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  autoSub: {
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
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: Candle.flame,
  },
  connectLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFDF8',
  },
});
