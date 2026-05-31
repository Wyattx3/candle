/**
 * ============================================================================
 * AGENT ACTIVITY UI — Apple liquid glass, minimalist, restrained motion
 * ============================================================================
 * Surfaces for the agent's live work:
 *   - ToolActivityCard    : one tool call (favicon for web tools)
 *   - ParallelActivityGroup : 2+ tools running at once, side by side
 *   - SubAgentPanel       : spawn_subagent / spawn_subagents_parallel workers
 *   - VirtualComputerFrame : a clean "computer window" (traffic lights, URL
 *                            pill with favicon) that shows the REAL content
 *                            the tool produced — page text, command output,
 *                            or a screenshot — not a fake placeholder.
 *
 * Motion is deliberately restrained: a single calm icon breathing/spin for
 * the active state and a soft fade-in on mount. No bright sweeping highlights.
 * Surfaces use the shared `LiquidGlass` material — translucent blur with a
 * soft specular highlight and hairline edge — so the transcript reads like
 * Apple's liquid glass: clean, minimal, and floating above the background.
 */

import { Image } from 'expo-image';
import {
  Boxes,
  Check,
  ChevronRight,
  Code2,
  Cpu,
  Download,
  FileText,
  Globe,
  Layers,
  Loader2,
  Search,
  SquareTerminal,
  Wrench,
} from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LiquidGlass } from './LiquidGlass';

// ────────────────────────────────────────────────────────────────────────────
// Types — mirror the `tool` AiStreamNode shape from app/index.tsx
// ────────────────────────────────────────────────────────────────────────────

export interface ActivityNode {
  id: string;
  actionName: string; // 'Search' | 'Browse' | 'Browser' | 'Python' | 'Terminal' | 'Subagent' | 'Workers' | 'Skill' | ...
  targetName: string;
  status: 'running' | 'done';
  output?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Domain + favicon helpers
// ────────────────────────────────────────────────────────────────────────────

export function extractDomain(value: string): string | null {
  if (!value) return null;
  try {
    const url = value.match(/https?:\/\/[^\s)"']+/)?.[0] ?? value;
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function faviconFor(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

const WEB_ACTIONS = new Set(['Search', 'Browse', 'Browser']);

function actionIcon(actionName: string) {
  switch (actionName) {
    case 'Search': return Search;
    case 'Browse':
    case 'Browser': return Globe;
    case 'Python': return Code2;
    case 'Terminal': return SquareTerminal;
    case 'Video': return Download;
    case 'File': return FileText;
    case 'Subagent': return Boxes;
    case 'Workers': return Layers;
    case 'Skill': return Wrench;
    case 'E2B': return Cpu;
    default: return Wrench;
  }
}

// Muted, professional accent per tool — used sparingly (icon tint only).
function accentFor(actionName: string): string {
  switch (actionName) {
    case 'Search': return '#3B82F6';
    case 'Browse':
    case 'Browser': return '#0EA5E9';
    case 'Python': return '#8B5CF6';
    case 'Terminal': return '#475569';
    case 'Video': return '#EC4899';
    case 'Subagent':
    case 'Workers': return '#F59E0B';
    case 'Skill': return '#10B981';
    default: return '#64748B';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Motion — minimal, professional
// ────────────────────────────────────────────────────────────────────────────

/** A calm continuous spinner (the only "busy" motion we use). */
const Spinner: React.FC<{ color: string; size?: number }> = ({ color, size = 14 }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} strokeWidth={2.4} />
    </Animated.View>
  );
};

/** A subtle opacity breathing applied to the leading icon while running. */
const Breathe: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { v.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.55, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>;
};

/** Soft fade + small slide on mount. */
const FadeIn: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
};

const StatusGlyph: React.FC<{ running: boolean; accent: string }> = ({ running, accent }) =>
  running ? <Spinner color={accent} /> : <Check size={14} color="#34C759" strokeWidth={2.6} />;

// ────────────────────────────────────────────────────────────────────────────
// Favicon avatar
// ────────────────────────────────────────────────────────────────────────────

const SiteAvatar: React.FC<{ domain: string | null; FallbackIcon: any; accent: string; size?: number }> = ({
  domain,
  FallbackIcon,
  accent,
  size = 18,
}) => {
  const [failed, setFailed] = React.useState(false);
  if (domain && !failed) {
    return (
      <Image
        source={{ uri: faviconFor(domain) }}
        style={{ width: size, height: size, borderRadius: Math.round(size / 4.5) }}
        contentFit="contain"
        transition={160}
        onError={() => setFailed(true)}
      />
    );
  }
  return <FallbackIcon size={size} color={accent} strokeWidth={2} />;
};

export const Favicon: React.FC<{ domain: string | null; size?: number; accent?: string }> = ({
  domain,
  size = 18,
  accent = '#64748B',
}) => <SiteAvatar domain={domain} FallbackIcon={Globe} accent={accent} size={size} />;

// ────────────────────────────────────────────────────────────────────────────
// ToolActivityCard
// ────────────────────────────────────────────────────────────────────────────

function activityVerb(node: ActivityNode): string {
  const running = node.status === 'running';
  switch (node.actionName) {
    case 'Search': return running ? 'Searching' : 'Searched';
    case 'Browse': return running ? 'Reading page' : 'Read page';
    case 'Browser': return running ? 'Browsing' : 'Browsed';
    case 'Python': return running ? 'Running code' : 'Ran code';
    case 'Terminal': return running ? 'Running command' : 'Command';
    case 'Video': return running ? 'Downloading' : 'Downloaded';
    case 'File': return running ? 'Preparing file' : 'File';
    case 'Skill': return running ? 'Loading skill' : 'Skill';
    case 'E2B': return running ? 'Setting up' : 'Environment';
    default: return running ? 'Working' : 'Done';
  }
}

export const ToolActivityCard: React.FC<{
  node: ActivityNode;
  expanded?: boolean;
  onToggle?: () => void;
  compact?: boolean;
  renderDetail?: (node: ActivityNode) => React.ReactNode;
}> = ({ node, expanded, onToggle, compact, renderDetail }) => {
  const accent = accentFor(node.actionName);
  const Icon = actionIcon(node.actionName);
  const isWeb = WEB_ACTIONS.has(node.actionName);
  const domain = isWeb ? extractDomain(node.targetName) : null;
  const running = node.status === 'running';
  const canExpand = node.status === 'done' && node.actionName !== 'Browse' && !!node.output && !!onToggle;

  return (
    <FadeIn style={styles.cardOuter}>
      <TouchableOpacity activeOpacity={canExpand ? 0.6 : 1} onPress={canExpand ? onToggle : undefined}>
        <LiquidGlass variant="thin" borderRadius={14} contentStyle={[styles.card, compact && styles.cardCompact]}>
          <Breathe active={running}>
            <View style={styles.iconWrap}>
              {isWeb ? <SiteAvatar domain={domain} FallbackIcon={Icon} accent={accent} size={18} /> : <Icon size={18} color={accent} strokeWidth={2} />}
            </View>
          </Breathe>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{activityVerb(node)}</Text>
            {node.targetName ? (
              <Text style={styles.cardTarget} numberOfLines={1}>{domain ?? node.targetName}</Text>
            ) : null}
          </View>
          <View style={styles.cardTail}>
            <StatusGlyph running={running} accent={accent} />
            {canExpand ? <Chevron rotated={!!expanded} /> : null}
          </View>
        </LiquidGlass>
      </TouchableOpacity>
      {expanded && canExpand && renderDetail ? (
        <LiquidGlass variant="thin" borderRadius={12} style={styles.detailGlass} contentStyle={styles.detailWrap}>{renderDetail(node)}</LiquidGlass>
      ) : null}
    </FadeIn>
  );
};

const Chevron: React.FC<{ rotated: boolean }> = ({ rotated }) => {
  const r = useRef(new Animated.Value(rotated ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(r, { toValue: rotated ? 1 : 0, duration: 160, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
  }, [rotated, r]);
  const rotate = r.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }], marginLeft: 4 }}>
      <ChevronRight size={15} color="#C7CDD6" strokeWidth={2.2} />
    </Animated.View>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// ParallelActivityGroup
// ────────────────────────────────────────────────────────────────────────────

export const ParallelActivityGroup: React.FC<{ nodes: ActivityNode[] }> = ({ nodes }) => {
  const anyRunning = nodes.some((n) => n.status === 'running');
  return (
    <FadeIn style={styles.parallelWrap}>
      <View style={styles.parallelHeader}>
        <Layers size={13} color="#94A3B8" strokeWidth={2.2} />
        <Text style={styles.parallelLabel}>
          {anyRunning ? `Working on ${nodes.length} tasks` : `${nodes.length} tasks`}
        </Text>
        <StatusGlyph running={anyRunning} accent="#94A3B8" />
      </View>
      <View style={styles.parallelGrid}>
        {nodes.map((n) => (
          <View key={n.id} style={styles.parallelItem}>
            <ToolActivityCard node={n} compact />
          </View>
        ))}
      </View>
    </FadeIn>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// SubAgentPanel
// ────────────────────────────────────────────────────────────────────────────

export const SubAgentPanel: React.FC<{ node: ActivityNode }> = ({ node }) => {
  const running = node.status === 'running';
  const accent = '#F59E0B';
  const isParallel = node.actionName === 'Workers';
  const workerChips = isParallel
    ? node.targetName.split('—').slice(1).join('—').split('|').map((s) => s.trim()).filter(Boolean)
    : [node.targetName];

  return (
    <FadeIn style={styles.cardOuter}>
      <LiquidGlass variant="regular" borderRadius={14} contentStyle={styles.subAgentCard}>
        <View style={styles.subAgentHeader}>
          <Breathe active={running}>
            <View style={styles.iconWrap}>
              {isParallel ? <Layers size={18} color={accent} strokeWidth={2} /> : <Boxes size={18} color={accent} strokeWidth={2} />}
            </View>
          </Breathe>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{isParallel ? 'Parallel workers' : 'Subagent'}</Text>
            <Text style={styles.cardTarget}>{running ? 'Working…' : 'Finished'}</Text>
          </View>
          <StatusGlyph running={running} accent={accent} />
        </View>
        <View style={styles.workerList}>
          {workerChips.slice(0, 4).map((task, i) => (
            <View key={i} style={styles.workerRow}>
              <View style={[styles.workerDot, { backgroundColor: running ? accent : '#34C759' }]} />
              <Text style={styles.workerText} numberOfLines={1}>{task}</Text>
            </View>
          ))}
        </View>
      </LiquidGlass>
    </FadeIn>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// VirtualComputerFrame — clean computer window with REAL content
// ────────────────────────────────────────────────────────────────────────────

/** Pull a short, human-readable preview out of a tool's raw output. */
function previewFromOutput(actionName: string, output?: string): string {
  if (!output) return '';
  let text = output.trim();
  // Tool outputs are often JSON envelopes — extract the useful field.
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') text = parsed;
    else if (parsed && typeof parsed === 'object') {
      text = parsed.text ?? parsed.stdout ?? parsed.output ?? parsed.result
        ?? parsed.content ?? parsed.metaDescription ?? JSON.stringify(parsed);
    }
  } catch {
    /* not JSON — use as-is */
  }
  text = String(text).replace(/\s+/g, ' ').trim();
  return text.slice(0, 240);
}

export const VirtualComputerFrame: React.FC<{ node: ActivityNode }> = ({ node }) => {
  const running = node.status === 'running';
  const isWeb = WEB_ACTIONS.has(node.actionName);
  const domain = isWeb ? extractDomain(node.targetName) : null;
  const accent = accentFor(node.actionName);
  const Icon = actionIcon(node.actionName);
  const isCode = node.actionName === 'Python' || node.actionName === 'Terminal';

  const title =
    node.actionName === 'Python' ? 'python3'
    : node.actionName === 'Terminal' ? 'bash'
    : node.actionName === 'Video' ? 'downloader'
    : domain ?? 'computer';

  const preview = previewFromOutput(node.actionName, node.output);

  return (
    <FadeIn style={styles.cardOuter}>
      <LiquidGlass variant="thick" borderRadius={14} contentStyle={styles.vm}>
        {/* Window chrome */}
        <View style={styles.vmChrome}>
          <View style={styles.trafficLights}>
            <View style={[styles.light, { backgroundColor: '#FF5F57' }]} />
            <View style={[styles.light, { backgroundColor: '#FEBC2E' }]} />
            <View style={[styles.light, { backgroundColor: '#28C840' }]} />
          </View>
          <View style={styles.urlPill}>
            {isWeb
              ? <SiteAvatar domain={domain} FallbackIcon={Icon} accent={accent} size={13} />
              : <Icon size={12} color={accent} strokeWidth={2} />}
            <Text style={styles.urlText} numberOfLines={1}>{title}</Text>
          </View>
          {running ? <Spinner color="#C7CDD6" size={13} /> : <Check size={13} color="#34C759" strokeWidth={2.6} />}
        </View>

        {/* Screen */}
        <View style={[styles.vmScreen, isCode && styles.vmScreenDark]}>
          {preview ? (
            <Text
              style={[styles.vmPreview, isCode && styles.vmPreviewCode]}
              numberOfLines={6}
            >
              {preview}
            </Text>
          ) : (
            <View style={styles.vmEmpty}>
              <Breathe active={running}>
                <Icon size={22} color={isCode ? '#64748B' : accent} strokeWidth={1.6} />
              </Breathe>
              <Text style={[styles.vmEmptyText, isCode && { color: '#94A3B8' }]} numberOfLines={1}>
                {running ? `${activityVerb(node)}…` : 'Done'}
              </Text>
            </View>
          )}
        </View>
      </LiquidGlass>
    </FadeIn>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Styles — Apple liquid glass: translucent material, hairline edge, soft radius.
// Background / border / shadow / corner radius are supplied by <LiquidGlass>;
// these styles carry only layout + the few opaque accents (icon tiles, the
// computer "screen") that must stay readable on top of the blur.
// ────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardOuter: { marginVertical: 3 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  cardCompact: { paddingVertical: 10, paddingHorizontal: 11, gap: 9 },
  iconWrap: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 13.5, fontWeight: '600', color: '#1C1C1E', letterSpacing: -0.1 },
  cardTarget: { fontSize: 12, color: '#8A8A8E', marginTop: 1.5 },
  cardTail: { flexDirection: 'row', alignItems: 'center' },

  detailGlass: {
    marginTop: 5,
    marginHorizontal: 2,
    maxHeight: 280,
  },
  detailWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // parallel
  parallelWrap: { marginVertical: 4 },
  parallelHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7, paddingHorizontal: 2 },
  parallelLabel: { fontSize: 12.5, fontWeight: '600', color: '#64748B', flex: 1, letterSpacing: -0.1 },
  parallelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  parallelItem: { flexGrow: 1, flexBasis: '47%' },

  // subagent
  subAgentCard: {
    padding: 13,
    gap: 11,
  },
  subAgentHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  workerList: { gap: 7, paddingLeft: 2 },
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  workerDot: { width: 6, height: 6, borderRadius: 3 },
  workerText: { flex: 1, fontSize: 12.5, color: '#48484A' },

  // virtual computer
  vm: {
    overflow: 'hidden',
  },
  vmChrome: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  trafficLights: { flexDirection: 'row', gap: 6 },
  light: { width: 10, height: 10, borderRadius: 5 },
  urlPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 10, paddingVertical: 4.5,
  },
  urlText: { flex: 1, fontSize: 11.5, color: '#6E6E73', fontWeight: '500' },
  vmScreen: { minHeight: 84, padding: 14, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.4)' },
  vmScreenDark: { backgroundColor: 'rgba(28,28,30,0.92)' },
  vmPreview: { fontSize: 12.5, lineHeight: 19, color: '#48484A' },
  vmPreviewCode: { color: '#D4D4D8', fontFamily: 'monospace', fontSize: 11.5, lineHeight: 18 },
  vmEmpty: { alignItems: 'center', gap: 9, paddingVertical: 6 },
  vmEmptyText: { fontSize: 12, color: '#8A8A8E' },
});
