/**
 * Approval — a chat-style screen where the agent pauses to request permission
 * before running a privileged command. Mirrors the Pencil `Screen · Approval`
 * node: Header, a Conversation (user prompt → agent lead → inline command
 * approval card with Reject / Allow once / Always actions → prompt-injection
 * security band), and a docked composer.
 */
import { useRouter } from 'expo-router';
import { Mic, MoreHorizontal, ShieldAlert, Terminal } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FlameMark } from '@/components/chat/FlameMark';
import { Header } from '@/components/chat/Header';
import { Candle, CandleFontFamilies } from '@/constants/theme';

/** The "Candle" agent label + flame tile that heads an agent turn. */
function AgentHead() {
  return (
    <View style={styles.agentHead}>
      <FlameMark size={20} radius={6} />
      <Text style={styles.agentLabel}>Candle</Text>
    </View>
  );
}

export default function ApprovalScreen() {
  const router = useRouter();

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
              <Text style={styles.userText}>Set up a Next.js app and run the dev server.</Text>
            </View>
          </View>

          {/* Agent turn */}
          <View style={styles.agentTurn}>
            <View style={styles.headWrap}>
              <AgentHead />
            </View>

            <View style={styles.leadWrap}>
              <Text style={styles.lead}>
                I&apos;ll set up the project and install dependencies. This needs to run a command in
                the sandbox:
              </Text>
            </View>

            {/* Command approval card */}
            <View style={styles.approvalWrap}>
              <View style={styles.approvalCard}>
                <View style={styles.approvalHeader}>
                  <View style={styles.approvalTitleWrap}>
                    <Terminal size={18} color={Candle.textPrimary} />
                    <Text style={styles.approvalTitle}>Run terminal command?</Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeLabel}>Needs review</Text>
                  </View>
                </View>

                <View style={styles.cmd}>
                  <Text style={styles.cmdText}>npm install &amp;&amp; npm run build</Text>
                </View>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionBtn, styles.rejectBtn]}
                    accessibilityRole="button"
                    accessibilityLabel="Reject command"
                  >
                    <Text style={styles.rejectLabel}>Reject</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.allowBtn]}
                    accessibilityRole="button"
                    accessibilityLabel="Allow command once"
                  >
                    <Text style={styles.allowLabel}>Allow once</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.alwaysBtn]}
                    accessibilityRole="button"
                    accessibilityLabel="Always allow this command"
                  >
                    <Text style={styles.alwaysLabel}>Always</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Prompt-injection security band */}
            <View style={styles.securityWrap}>
              <View style={styles.security}>
                <ShieldAlert size={18} color={Candle.danger} />
                <Text style={styles.securityLabel}>
                  Possible prompt-injection detected in tool output
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Dock */}
        <View style={styles.dock}>
          <View style={styles.composer}>
            <Pressable
              style={styles.moreBtn}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <MoreHorizontal size={20} color={Candle.textSecondary} />
            </Pressable>
            <Text style={styles.placeholder}>Ask anything…</Text>
            <Pressable
              style={styles.sendBtn}
              accessibilityRole="button"
              accessibilityLabel="Voice input"
            >
              <Mic size={20} color={Candle.textSecondary} />
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
  // User row
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
    maxWidth: 220,
  },
  userText: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14,
    lineHeight: 14 * 1.4,
    color: '#FFFDF8',
  },
  // Agent turn
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
  // Approval card
  approvalWrap: {
    width: '100%',
  },
  approvalCard: {
    gap: 12,
    padding: 16,
    backgroundColor: Candle.bgCanvas,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Candle.hairline,
  },
  approvalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  approvalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  approvalTitle: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 14,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  badge: {
    borderRadius: 999,
    backgroundColor: '#C7740024',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 11,
    fontWeight: '700',
    color: '#C77400',
  },
  cmd: {
    borderRadius: 10,
    backgroundColor: Candle.surfaceSunken,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cmdText: {
    fontFamily: CandleFontFamilies.mono,
    fontSize: 12.5,
    color: Candle.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: '#C0341D66',
  },
  rejectLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.danger,
  },
  allowBtn: {
    backgroundColor: Candle.ink,
  },
  allowLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFDF8',
  },
  alwaysBtn: {
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
  },
  alwaysLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  // Security band
  securityWrap: {
    width: '100%',
  },
  security: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Candle.dangerSoft,
    padding: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#C0341D40',
  },
  securityLabel: {
    flex: 1,
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12,
    fontWeight: '500',
    color: Candle.danger,
  },
  // Dock
  dock: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    borderRadius: 28,
    backgroundColor: Candle.glassThick,
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    paddingHorizontal: 8,
    shadowColor: '#C8A06E',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
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
    fontSize: 15,
    color: Candle.textTertiary,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
