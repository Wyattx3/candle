/**
 * AgentTurn — renders one AI turn from its `AiStreamNode[]`. It draws the
 * agent head, an action pane (reasoning + tool rows + approval/security
 * cards), and the final answer text. Nodes are rendered in stream order so
 * the thinking → tools → answer narrative reads top to bottom.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GenUIBlock } from '@/components/GenUI/GenUIBlock';
import { Candle, CandleFontFamilies } from '@/constants/theme';
import type { AiMessage, AiStreamNode } from '@/hooks/chat-types';
import { ApprovalCard } from './ApprovalCard';
import { MarkdownText } from './MarkdownText';
import { ReasoningRow } from './ReasoningRow';
import { SecurityCard } from './SecurityCard';
import { ToolRow, ToolShimmerRow } from './ToolRow';

/** Grok-style: only the most recent N tool rows get full UI; older ones shimmer. */
const TOOL_ROW_CAP = 2;

interface AgentTurnProps {
  message: AiMessage;
}

/** Small flame glyph for the agent head tile. */
function MiniFlame() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Path
        d="M12 2c.6 2.6-.9 4.2-2.3 5.6C8.2 9 6.8 10.5 6.8 13.2 6.8 17 9.5 20 12.5 20c3 0 5.2-2.3 5.2-5.4 0-2-.9-3.6-1.9-4.9-.4 1-1.1 1.7-2 2 .6-1.9.2-4-1-5.6C11.7 4.3 11.5 3 12 2z"
        fill={Candle.textOnInk}
      />
    </Svg>
  );
}

function renderNode(node: AiStreamNode) {
  switch (node.type) {
    case 'reasoning':
      return <ReasoningRow key={node.id} content={node.content} />;
    case 'tool':
      return <ToolRow key={node.id} node={node} />;
    case 'approval':
      return <ApprovalCard key={node.id} node={node} />;
    case 'security':
      return <SecurityCard key={node.id} node={node} />;
    default:
      return null;
  }
}

export function AgentTurn({ message }: AgentTurnProps) {
  const textNodes = message.nodes.filter(
    (n): n is Extract<AiStreamNode, { type: 'text' }> => n.type === 'text',
  );
  const answer = textNodes.map((n) => n.content).join('').trim();
  const actionNodes = message.nodes.filter(
    (n) => n.type !== 'text' && n.type !== 'genui',
  );
  const genuiNodes = message.nodes.filter(
    (n): n is Extract<AiStreamNode, { type: 'genui' }> => n.type === 'genui',
  );

  // Only the most recent TOOL_ROW_CAP tool rows show full UI; older ones
  // collapse to a shimmer placeholder (Grok-style).
  const toolIds = actionNodes.filter((n) => n.type === 'tool').map((n) => n.id);
  const fullToolIds = new Set(toolIds.slice(-TOOL_ROW_CAP));

  return (
    <View style={styles.turn}>
      {/* Agent head */}
      <View style={styles.headWrap}>
        <View style={styles.head}>
          <View style={styles.flameTile}>
            <MiniFlame />
          </View>
          <Text style={styles.name}>Candle</Text>
        </View>
      </View>

      {/* Action pane */}
      {actionNodes.length > 0 ? (
        <View style={styles.actionPane}>
          {actionNodes.map((node) =>
            node.type === 'tool' && !fullToolIds.has(node.id) ? (
              <ToolShimmerRow key={node.id} node={node} />
            ) : (
              renderNode(node)
            ),
          )}
        </View>
      ) : null}

      {/* Answer */}
      {answer.length > 0 ? (
        <View style={styles.ansWrap}>
          <MarkdownText content={answer} />
        </View>
      ) : null}

      {/* Inline generative UI artifacts */}
      {genuiNodes.length > 0 ? (
        <View style={styles.genuiWrap}>
          {genuiNodes.map((node) => (
            <GenUIBlock key={node.id} kind={node.kind} data={node.data} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  turn: {
    gap: 12,
  },
  headWrap: {
    paddingHorizontal: 20,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  flameTile: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    color: Candle.textSecondary,
  },
  actionPane: {
    paddingHorizontal: 20,
    gap: 4,
  },
  ansWrap: {
    paddingHorizontal: 20,
  },
  genuiWrap: {
    paddingHorizontal: 20,
    gap: 12,
  },
});
