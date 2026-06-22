/**
 * ToolRow — one tool activity line in the agent stream, Grok-style: a leading
 * icon (site favicon for Browse), an action label that shimmers while running,
 * and — for finished searches — a stack of source favicons + result count.
 * No spinners, no check marks. Rows beyond the visible cap render as a
 * ShimmerRow skeleton (see AgentTurn).
 */
import { Image } from 'expo-image';
import {
    Boxes,
    BrainCog,
    Code,
    Download,
    FileText,
    Globe,
    Image as ImageIcon,
    ListTodo,
    Search,
    Terminal,
    type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { Candle, CandleFontFamilies } from '@/constants/theme';
import type { ToolNode } from '@/hooks/chat-types';

const PURPLE = '#9B5DE5';

/** Pick the leading icon + tint for a given action name. */
function leadingIcon(actionName: string): { Icon: LucideIcon; color: string } {
  switch (actionName) {
    case 'Search':
    case 'Research':
    case 'Finance':
    case 'Recall':
      return { Icon: Search, color: Candle.flame };
    case 'Browse':
    case 'Browser':
      return { Icon: Globe, color: Candle.flame };
    case 'Screenshot':
      return { Icon: ImageIcon, color: Candle.flame };
    case 'Python':
    case 'Node':
    case 'Install':
    case 'Request':
      return { Icon: Code, color: PURPLE };
    case 'Terminal':
      return { Icon: Terminal, color: PURPLE };
    case 'File':
    case 'Edit':
      return { Icon: FileText, color: PURPLE };
    case 'Video':
      return { Icon: Download, color: Candle.flame };
    case 'Subagent':
    case 'Workers':
      return { Icon: BrainCog, color: PURPLE };
    case 'Tasks':
    case 'Board':
      return { Icon: ListTodo, color: Candle.flame };
    case 'Skill':
    case 'Memory':
    case 'Toolbox':
    case 'E2B':
      return { Icon: Boxes, color: PURPLE };
    default:
      return { Icon: Globe, color: Candle.flame };
  }
}

function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
}

/** Extract a clean hostname from a (possibly truncated) URL string. */
function hostnameOf(value: string): string | null {
  try {
    const u = new URL(value.startsWith('http') ? value : `https://${value}`);
    return u.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Pull source hostnames + result count out of a finished search_web output. */
function parseSearchResults(output?: string): { hosts: string[]; count: number } {
  if (!output) return { hosts: [], count: 0 };
  try {
    const arr = JSON.parse(output);
    if (!Array.isArray(arr)) return { hosts: [], count: 0 };
    const real = arr.filter((r) => r && typeof r.url === 'string' && r.url);
    const hosts: string[] = [];
    for (const r of real) {
      const h = hostnameOf(r.url);
      if (h && !hosts.includes(h)) hosts.push(h);
      if (hosts.length >= 4) break;
    }
    return { hosts, count: real.length };
  } catch {
    return { hosts: [], count: 0 };
  }
}

/** A favicon image that falls back to a globe glyph if it fails to load. */
function FaviconIcon({ host, size = 16 }: { host: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!host || failed) return <Globe size={size - 1} color={Candle.flame} />;
  return (
    <Image
      source={{ uri: faviconUrl(host) }}
      style={{ width: size, height: size, borderRadius: 4 }}
      contentFit="contain"
      transition={150}
      onError={() => setFailed(true)}
    />
  );
}

/** Opacity-pulse text — the "working" shimmer for a running action label. */
function PulseText({ children, style }: { children: React.ReactNode; style?: any }) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.Text style={[style, animated]}>{children}</Animated.Text>;
}

/**
 * Collapsed older tool row (beyond the visible cap). Keeps the title readable
 * but visually de-emphasized — a compact, dimmed single line, NOT a blank
 * skeleton bar. A finished step shouldn't look like it's still loading.
 */
export function ToolShimmerRow({ node }: { node: ToolNode }) {
  const isBrowse = node.actionName === 'Browse' || node.actionName === 'Browser';
  const { Icon, color } = leadingIcon(node.actionName);
  const host = isBrowse ? hostnameOf(node.targetName) : null;
  return (
    <View style={[styles.row, styles.collapsedRow]}>
      <View style={styles.collapsedIconWell}>
        {isBrowse ? <FaviconIcon host={host} size={13} /> : <Icon size={12} color={color} />}
      </View>
      <Text style={styles.collapsedText} numberOfLines={1}>
        {node.targetName || node.actionName}
      </Text>
    </View>
  );
}

interface ToolRowProps {
  node: ToolNode;
}

export function ToolRow({ node }: ToolRowProps) {
  const running = node.status === 'running';
  const isBrowse = node.actionName === 'Browse' || node.actionName === 'Browser';
  const isSearch = node.actionName === 'Search';
  const { Icon, color } = leadingIcon(node.actionName);
  const browseHost = isBrowse ? hostnameOf(node.targetName) : null;
  const search = isSearch && !running ? parseSearchResults(node.output) : null;

  return (
    <View style={styles.row}>
      <View style={styles.iconWell}>
        {isBrowse ? <FaviconIcon host={browseHost} size={18} /> : <Icon size={15} color={color} />}
      </View>

      <View style={styles.texts}>
        {running ? (
          <PulseText style={styles.action}>{node.actionName}…</PulseText>
        ) : (
          <Text style={styles.action}>{node.actionName}</Text>
        )}
        {node.targetName ? (
          <Text style={styles.target} numberOfLines={1}>
            {node.targetName}
          </Text>
        ) : null}
      </View>

      {search && search.hosts.length > 0 ? (
        <View style={styles.resultMeta}>
          <View style={styles.faviconStack}>
            {search.hosts.map((h, i) => (
              <View key={h} style={[styles.faviconPill, i > 0 && styles.faviconOverlap]}>
                <FaviconIcon host={h} size={13} />
              </View>
            ))}
          </View>
          {search.count > 0 ? <Text style={styles.count}>{search.count} results</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  iconWell: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 4,
  },
  action: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  target: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12,
    color: Candle.textTertiary,
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  faviconStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faviconPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faviconOverlap: {
    marginLeft: -6,
  },
  count: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11,
    color: Candle.textTertiary,
  },
  collapsedRow: {
    paddingVertical: 3,
    gap: 8,
    opacity: 0.5,
  },
  collapsedIconWell: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedText: {
    flex: 1,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11,
    color: Candle.textTertiary,
  },
});
