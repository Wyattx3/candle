/**
 * AgentActionBlock — an inline GenUI agent-action card rendered in the chat
 * stream. Mirrors the Pencil `GenUI/7 · AI Agent Actions` "Action card ·
 * deploy" cell: a warm-canvas card with a flame icon, title, status subtitle,
 * a short step/parameter list, and a primary action affordance (plus an
 * optional secondary). Pure presentational; falls back to SAMPLE data when
 * `data` is missing or malformed.
 */
import { CircleCheck, Rocket } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface Step {
  label: string;
  value?: string;
}

interface AgentActionData {
  title: string;
  status: string;
  steps: Step[];
  primaryLabel: string;
  secondaryLabel?: string;
}

const SAMPLE: AgentActionData = {
  title: 'Ready to deploy',
  status: 'Build passed. Deploy candle-backend to production?',
  steps: [
    { label: 'Target', value: 'production' },
    { label: 'Service', value: 'candle-backend' },
    { label: 'Build', value: '#1284 · passed' },
  ],
  primaryLabel: 'Deploy',
  secondaryLabel: 'Later',
};

/** Coerce an unknown payload into safe AgentActionData. */
function normalize(data: unknown): AgentActionData {
  if (!data || typeof data !== 'object') return SAMPLE;
  const d = data as Record<string, unknown>;
  const steps = Array.isArray(d.steps)
    ? (d.steps as unknown[])
        .map((s): Step | null => {
          const r = s as Record<string, unknown>;
          if (!r || typeof r !== 'object' || typeof r.label !== 'string') return null;
          return { label: r.label, value: typeof r.value === 'string' ? r.value : undefined };
        })
        .filter((s): s is Step => s !== null)
    : [];
  return {
    title: typeof d.title === 'string' ? d.title : SAMPLE.title,
    status: typeof d.status === 'string' ? d.status : SAMPLE.status,
    steps: steps.length > 0 ? steps : SAMPLE.steps,
    primaryLabel: typeof d.primaryLabel === 'string' ? d.primaryLabel : SAMPLE.primaryLabel,
    secondaryLabel:
      typeof d.secondaryLabel === 'string' ? d.secondaryLabel : SAMPLE.secondaryLabel,
  };
}

export function AgentActionBlock({ data }: { data?: unknown }) {
  const model = useMemo(() => normalize(data), [data]);
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        {/* Head */}
        <View style={styles.head}>
          <Rocket size={20} color={Candle.flame} />
          <View style={styles.headText}>
            <Text style={styles.title}>{model.title}</Text>
            <Text style={styles.status}>{model.status}</Text>
          </View>
        </View>

        {/* Steps / parameters */}
        <View style={styles.steps}>
          {model.steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <CircleCheck size={14} color={Candle.success} />
              <Text style={styles.stepLabel} numberOfLines={1}>
                {step.label}
              </Text>
              {step.value ? (
                <Text style={styles.stepValue} numberOfLines={1}>
                  {step.value}
                </Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {model.secondaryLabel ? (
            <Pressable
              style={[styles.btn, styles.secondaryBtn]}
              accessibilityRole="button"
              accessibilityLabel={model.secondaryLabel}
            >
              <Text style={styles.secondaryLabel}>{model.secondaryLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.btn, styles.primaryBtn]}
            accessibilityRole="button"
            accessibilityLabel={model.primaryLabel}
          >
            <Rocket size={16} color={Candle.textOnInk} />
            <Text style={styles.primaryLabel}>{model.primaryLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  card: {
    gap: 12,
    borderRadius: 16,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 14,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  status: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.4,
    color: Candle.textSecondary,
  },
  steps: {
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12.5,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  stepValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: CandleFontFamilies.mono,
    fontSize: 12,
    color: Candle.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  secondaryBtn: {
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
  },
  secondaryLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: Candle.flame,
    shadowColor: Candle.flameDeep,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  primaryLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textOnInk,
  },
});
