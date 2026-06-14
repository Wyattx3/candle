/**
 * Main chat screen — the empty-state Home + the streaming Chat conversation.
 *
 * Layout (bottom → top z-order):
 *   • A ScrollView holds the conversation (WelcomeState when empty, otherwise
 *     UserBubble / AgentTurn list).
 *   • A floating Header sits on top over a top fade gradient.
 *   • The Composer dock sits at the bottom over a bottom fade gradient.
 *   • A ConnectionBanner appears under the header only when the socket drops.
 *
 * All chat state comes from `useChatAgent`; approvals are provided to nested
 * cards through `ApprovalContext.Provider`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentTurn } from '@/components/chat/AgentTurn';
import { Composer } from '@/components/chat/Composer';
import { ConnectionBanner } from '@/components/chat/ConnectionBanner';
import { Header } from '@/components/chat/Header';
import { UserBubble } from '@/components/chat/UserBubble';
import { WelcomeState } from '@/components/chat/WelcomeState';
import { Candle } from '@/constants/theme';
import { ApprovalContext, useChatAgent } from '@/hooks/useChatAgent';

const TOP_FADE: readonly [string, string, string] = [
  Candle.bgCanvas,
  'rgba(251,246,239,0.92)',
  'rgba(251,246,239,0)',
];
const BOTTOM_FADE: readonly [string, string, string] = [
  'rgba(251,246,239,0)',
  'rgba(251,246,239,0.92)',
  Candle.bgCanvas,
];

export default function Index() {
  const { messages, sendPrompt, decideApproval, wsState, reconnect, scrollRef } = useChatAgent();
  const scrollViewRef = useRef<ScrollView>(null);
  const router = useRouter();

  // Bridge the imperative scroll handle expected by the hook to the ScrollView.
  const setScrollRef = useCallback(
    (node: ScrollView | null) => {
      scrollViewRef.current = node;
      scrollRef.current = node
        ? { scrollToEnd: (opts) => node.scrollToEnd(opts) }
        : null;
    },
    [scrollRef],
  );

  const isEmpty = messages.length === 0;
  const composerVariant = isEmpty ? 'home' : 'chat';

  return (
    <ApprovalContext.Provider value={{ decide: decideApproval }}>
      <View style={styles.root}>
        <ScrollView
          ref={setScrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isEmpty ? styles.scrollContentEmpty : null,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isEmpty ? (
            <WelcomeState onPickPrompt={sendPrompt} />
          ) : (
            <View style={styles.conversation}>
              {messages.map((message) =>
                message.type === 'user' ? (
                  <UserBubble key={message.id} content={message.content} />
                ) : (
                  <AgentTurn key={message.id} message={message} />
                ),
              )}
            </View>
          )}
        </ScrollView>

        {/* Top fade + floating header */}
        <View style={styles.topLayer} pointerEvents="box-none">
          <LinearGradient colors={TOP_FADE} style={styles.topGradient} pointerEvents="none" />
          <SafeAreaView edges={['top']} pointerEvents="box-none">
            <Header
              onMenu={() => router.push('/session-drawer')}
              onNew={reconnect}
              onTitle={() => router.push('/model-picker')}
            />
            <ConnectionBanner state={wsState} onReconnect={reconnect} />
          </SafeAreaView>
        </View>

        {/* Bottom fade + composer dock */}
        <View style={styles.bottomLayer} pointerEvents="box-none">
          <LinearGradient colors={BOTTOM_FADE} style={styles.bottomGradient} pointerEvents="none" />
          <SafeAreaView edges={['bottom']} pointerEvents="box-none">
            <Composer
              onSend={sendPrompt}
              onVoice={() => router.push('/voice')}
              variant={composerVariant}
            />
          </SafeAreaView>
        </View>
      </View>
    </ApprovalContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Candle.bgCanvas,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 120,
    paddingBottom: 140,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  conversation: {
    gap: 18,
    paddingTop: 10,
  },
  topLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topGradient: {
    ...StyleSheet.absoluteFillObject,
    bottom: -24,
  },
  bottomLayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomGradient: {
    ...StyleSheet.absoluteFillObject,
    top: -40,
  },
});
