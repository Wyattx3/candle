/**
 * ApprovalCard — renders a command-approval request inline in the agent
 * stream. While pending it offers Allow once / Always / Reject actions wired
 * through `ApprovalContext`. Once resolved it shows the outcome.
 */
import { CircleCheck, ShieldAlert, XCircle } from 'lucide-react-native';
import { useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';
import type { ApprovalNode } from '@/hooks/chat-types';
import { ApprovalContext } from '@/hooks/useChatAgent';

interface ApprovalCardProps {
  node: ApprovalNode;
}

const RISK_COLOR: Record<ApprovalNode['riskLevel'], string> = {
  low: Candle.success,
  medium: Candle.warning,
  high: Candle.danger,
};

function statusLabel(status: ApprovalNode['status']): string {
  switch (status) {
    case 'allow_once':
      return 'Allowed once';
    case 'allow_always':
      return 'Always allowed';
    case 'reject':
      return 'Rejected';
    case 'auto_reject':
      return 'Auto-rejected (high risk)';
    case 'expired':
      return 'Request expired';
    default:
      return 'Awaiting approval';
  }
}

export function ApprovalCard({ node }: ApprovalCardProps) {
  const { decide } = useContext(ApprovalContext);
  const pending = node.status === 'pending';
  const riskColor = RISK_COLOR[node.riskLevel];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ShieldAlert size={18} color={riskColor} />
        <Text style={[styles.risk, { color: riskColor }]}>
          {node.riskLevel.toUpperCase()} RISK COMMAND
        </Text>
      </View>

      <Text style={styles.command}>{node.command}</Text>
      {node.reason ? <Text style={styles.reason}>{node.reason}</Text> : null}

      {pending ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => decide(node.requestId, node.command, 'allow_once')}
            accessibilityRole="button"
            accessibilityLabel="Allow once"
          >
            <Text style={styles.btnPrimaryText}>Allow once</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={() => decide(node.requestId, node.command, 'allow_always')}
            accessibilityRole="button"
            accessibilityLabel="Always allow"
          >
            <Text style={styles.btnGhostText}>Always</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={() => decide(node.requestId, node.command, 'reject')}
            accessibilityRole="button"
            accessibilityLabel="Reject"
          >
            <Text style={[styles.btnGhostText, { color: Candle.danger }]}>Reject</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.resolved}>
          {node.status === 'allow_once' || node.status === 'allow_always' ? (
            <CircleCheck size={15} color={Candle.success} />
          ) : (
            <XCircle size={15} color={Candle.danger} />
          )}
          <Text style={styles.resolvedText}>{statusLabel(node.status)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Candle.hairline,
    backgroundColor: Candle.bgElevated,
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  risk: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  command: {
    fontFamily: CandleFontFamilies.mono,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: Candle.textPrimary,
  },
  reason: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.45,
    color: Candle.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: Candle.flame,
  },
  btnPrimaryText: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textOnInk,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: Candle.hairline,
    backgroundColor: 'transparent',
  },
  btnGhostText: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 13,
    fontWeight: '500',
    color: Candle.textPrimary,
  },
  resolved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  resolvedText: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12.5,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
});
