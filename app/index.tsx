import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, KeyboardAvoidingView, LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Svg, { Circle, Line, Path, Rect, SvgXml } from 'react-native-svg';
import { ArtifactResults, stripArtifactLinksFromText } from '../components/ArtifactResults';
import { UserBubble } from '../components/ChatBubble';
import { Header } from '../components/Header';
import { InputArea } from '../components/InputArea';
import { ChatMode, MarkdownText } from '../components/MarkdownText';
import { WelcomeState } from '../components/WelcomeState';
import { LiquidGlass } from '../components/LiquidGlass';
import {
  ToolActivityCard,
  ParallelActivityGroup,
  SubAgentPanel,
  VirtualComputerFrame,
  Favicon,
  type ActivityNode,
} from '../components/AgentActivity';
import { useStableWebSocket } from '../hooks/useStableWebSocket';

const ACTION_DETAIL_MAX_HEIGHT = Math.round(Dimensions.get('window').height / 3);
const candleStaticSvgXml = `<?xml version="1.0" encoding="UTF-8"?>
<svg version="1.1" viewBox="0 0 1254 1254" width="1254" height="1254" xmlns="http://www.w3.org/2000/svg">
<path transform="translate(0)" d="m0 0h1254v1254h-1254z" fill="#FCFAFB"/>
<path transform="translate(619,198)" d="m0 0h11l11 1 1 54 27 1v29h27v55h27v105h-27v27h-20l-8-1v7h-27v25h105v21h26l1 19 19 1v276l-39 1-1 41-41 1-1 57h-56v55h-59v-55h-57l-1-57-39-1v-42l-36 1-1-1v-276h20v-20l26-1 1-20h106v-25h-26v-6h-25v-27h-27l-1-2v-97l1-6h27v-55h25v-30l26 1v-55z" fill="#1B1B1A"/>
<path transform="translate(619,198)" d="m0 0h11l11 1 1 54 27 1v29h27v55h27v105h-27v27h-20l-8-1v7h-27v25h105v41h18v26h-26v92h-27v-64h-58v47h-29v-47h-42v35h-22v-57h-27l-1-25-24-1v-26h80v-21h26v-25h-26v-6h-25v-27h-27l-1-2v-97l1-6h27v-55h25v-30l26 1v-55z" fill="#FC7B0B"/>
<path transform="translate(614,450)" d="m0 0h27v51h105v41h18v26h-26v92h-27v-64h-58v47h-29v-47h-42v35h-22v-57h-27l-1-25-24-1v-26h80v-21h26z" fill="#FD7A0B"/>
<path transform="translate(614,311)" d="m0 0h27l1 53 26 1v58l-1 1h-25l-1 26h-26l-1-1v-25h-26v-59l26-1z" fill="#FE9B1D"/>
<path transform="translate(614,450)" d="m0 0h27v75h26v26h-79v-26h26z" fill="#1B1B1A"/>
<path transform="translate(614,365)" d="m0 0h27l1 25 26 1v32l-1 1h-25l-1 26h-26l-1-1z" fill="#FCC549"/>
<path transform="translate(601,861)" d="m0 0 48 1v50l-4 1h-44l-1-1v-50z" fill="#FCF9F7"/>
<path transform="translate(508,501)" d="m0 0h80v21h-81z" fill="#1B1B19"/>
<path transform="translate(667,501)" d="m0 0h79v21h-79z" fill="#1B1B1A"/>
<path transform="translate(614,391)" d="m0 0h27v59h-26l-1-1z" fill="#FCFBFC"/>
<path transform="translate(666,810)" d="m0 0h35v36h-35z" fill="#FCFAFB"/>
<path transform="translate(723,757)" d="m0 0h34l1 1v34l-1 1h-34l-1-35z" fill="#FCF8F3"/>
<path transform="translate(566,818)" d="m0 0h34v35l-1 1h-33l-1-1v-34z" fill="#FCF8F3"/>
<path transform="translate(498,740)" d="m0 0h35v35l-3 1h-31l-1-1z" fill="#FCF9F7"/>
<path transform="translate(757,860)" d="m0 0h31l1 1v31l-1 1h-31l-1-1v-31z" fill="#1B1B1A"/>
<path transform="translate(722,926)" d="m0 0h32v33h-32l-1-1v-31z" fill="#1B1B1A"/>
<path transform="translate(495,926)" d="m0 0h31l1 25-1 8h-32v-32z" fill="#1B1B1A"/>
<path transform="translate(461,860)" d="m0 0h32v33h-32z" fill="#1B1B1A"/>
<path transform="translate(545,978)" d="m0 0h31l1 1v31h-33v-31z" fill="#1B1B1A"/>
<path transform="translate(610,1024)" d="m0 0h32v32h-32z" fill="#1B1B1A"/>
<path transform="translate(675,975)" d="m0 0h32v32h-32z" fill="#1B1B1A"/>
<path transform="translate(588,391)" d="m0 0h26v33h-26z" fill="#FCC549"/>
<path transform="translate(624,671)" d="m0 0h28v27h-28z" fill="#FD7A0B"/>
<path transform="translate(753,416)" d="m0 0h27v27h-27z" fill="#FC7F0F"/>
<path transform="translate(479,338)" d="m0 0h26v27h-27v-26z" fill="#FD800F"/>
<path transform="translate(667,423)" d="m0 0h1v27h-27v-20l1-6z" fill="#FD9B1D"/>
<path transform="translate(588,424)" d="m0 0h26l1 26-1 1h-26z" fill="#FD9B1D"/>
<path transform="translate(732,258)" d="m0 0h26v25h-26z" fill="#FD7D0C"/>
<path transform="translate(616,144)" d="m0 0h23l1 1v24h-25v-24z" fill="#FD8110"/>
<path transform="translate(575,396)" d="m0 0h2v7l-4 2h-2l-3 4h-2l1-7 5-4z" fill="#FD9A1C"/>
</svg>`;
const candleStaticTransparentSvgXml = candleStaticSvgXml.replace(
  '<path transform="translate(0)" d="m0 0h1254v1254h-1254z" fill="#FCFAFB"/>',
  ''
);

/**
 * ============================================================================
 * UNIFIED TYPES
 * ============================================================================
 */

export type AiStreamNode =
  | { type: 'text'; id: string; content: string }
  | { type: 'reasoning'; id: string; content: string }
  | { type: 'tool'; id: string; actionName: string; targetName: string; status: 'running' | 'done'; output?: string; batchId?: number }
  | {
      type: 'approval';
      id: string;
      requestId: string;
      command: string;
      riskLevel: 'low' | 'medium' | 'high';
      reason?: string;
      status: 'pending' | 'allow_once' | 'allow_always' | 'reject' | 'auto_reject' | 'expired';
    }
  | {
      type: 'security';
      id: string;
      severity: 'medium' | 'high';
      labels: string[];
      where: 'prompt' | 'tool';
    };

export type MessageItem =
  | { id: string; type: 'user'; content: string }
  | { id: string; type: 'ai'; mode: ChatMode; nodes: AiStreamNode[]; isProcessing: boolean };

/**
 * ============================================================================
 * ICONS FOR INLINE TOOLS
 * ============================================================================
 */

const SvgChevronRight: React.FC<{ size?: number; color?: string; rotation?: number }> = ({ size = 16, color = "#9CA3AF", rotation = 0 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: `${rotation}deg` }] }}>
    <Path d="M9 18L15 12L9 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgSearchIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#6B7280" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgExecuteIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#6B7280" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M10 20L14 4M18 8L22 12L18 16M6 16L2 12L6 8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgTerminalIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#6B7280" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth={2} />
    <Path d="M6 8L10 12L6 16M13 16H18" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/**
 * ============================================================================
 * ANIMATED SHINY TYPING INDICATOR
 * ============================================================================
 */

const CandleStaticIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <View style={{ width: size, height: size, overflow: 'hidden', backgroundColor: 'transparent' }}>
    <SvgXml xml={candleStaticTransparentSvgXml} width={size} height={size} style={{ backgroundColor: 'transparent' }} />
  </View>
);

const CandleLiveIcon: React.FC<{ size?: number }> = ({ size = 34 }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 620, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  return (
    <Animated.View style={{ marginRight: 8, transform: [{ scale }], opacity }}>
      <CandleStaticIcon size={size} />
    </Animated.View>
  );
};

const ShimmerText: React.FC<{ children: string; style?: object }> = ({ children, style }) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 1, 0.45] });

  return (
    <Animated.Text style={[style, { opacity }]}>
      {children}
    </Animated.Text>
  );
};

const RunningShimmer: React.FC = () => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 950,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 1, 0.25] });
  const scaleX = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.65, 1, 0.65] });

  return <Animated.View style={[aiBubbleStyles.runningShimmer, { opacity, transform: [{ scaleX }] }]} />;
};

const TypingIndicator: React.FC = () => {
  return (
    <View style={aiBubbleStyles.liveStatus}>
      <CandleLiveIcon size={34} />
      <Text style={aiBubbleStyles.liveStatusText}>Candle is </Text>
      <ShimmerText style={aiBubbleStyles.liveStatusText}>thinking</ShimmerText>
    </View>
  );
};

const CandleDoneHeader: React.FC = () => (
  <View style={aiBubbleStyles.doneHeader}>
    <CandleStaticIcon size={34} />
    <Text style={aiBubbleStyles.doneHeaderText}>Candle</Text>
  </View>
);

/**
 * ============================================================================
 * TOOL UI COMPONENTS
 * ============================================================================
 */

const WebSearchCollage: React.FC<{ output?: string }> = ({ output }) => {
  if (!output) return null;
  
  const results = getSearchResults(output);
  if (!results) {
    return <MarkdownText content={output} mode="reasoning" />;
  }

  if (results.length === 0) {
    return <Text style={{ color: '#6B7280', fontSize: 12 }}>No relevant results found.</Text>;
  }

  const handleOpenLink = async (url: string) => {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: '#F8F9FA'
    });
  };

  const getDomain = (url: string) => {
    try {
      const { hostname } = new URL(url);
      return hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  return (
    <View style={toolStyles.collageContainer}>
      {results.map((r, i) => (
        <View key={i}>
          {i > 0 && <View style={toolStyles.divider} />}
          <TouchableOpacity style={toolStyles.searchCard} onPress={() => handleOpenLink(r.url)} activeOpacity={0.6}>
            <View style={toolStyles.domainRow}>
              <View style={toolStyles.domainIcon}>
                <Favicon domain={getDomain(r.url)} size={16} />
              </View>
              <Text style={toolStyles.searchCardUrl} numberOfLines={1}>{getDomain(r.url)}</Text>
            </View>
            <Text style={toolStyles.searchCardTitle} numberOfLines={2}>{r.title}</Text>
            <Text style={toolStyles.searchCardSnippet} numberOfLines={3}>{r.snippet}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseMaybeJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const parsed = safeJsonParse(trimmed);
  return parsed === undefined ? value : parsed;
}

function unwrapToolPayload(value: unknown): unknown {
  let current = parseMaybeJsonValue(value);

  for (let i = 0; i < 4; i += 1) {
    if (!current || typeof current !== 'object') break;
    const data = current as Record<string, unknown>;
    const next = data.content ?? (data.kwargs as Record<string, unknown> | undefined)?.content ?? data.output ?? data.result ?? data.input;
    if (next === undefined || next === current) break;
    current = parseMaybeJsonValue(next);
  }

  return current;
}

function valueToDisplayString(value: unknown): string {
  const unwrapped = unwrapToolPayload(value);
  if (typeof unwrapped === 'string') return unwrapped;
  if (unwrapped == null) return '';
  if (Array.isArray(unwrapped)) return JSON.stringify(unwrapped);
  if (typeof unwrapped === 'object') return summarizeStructuredOutput(unwrapped);
  return String(unwrapped);
}

function getSearchResults(output: unknown): any[] | undefined {
  const unwrapped = unwrapToolPayload(output);
  if (Array.isArray(unwrapped)) return unwrapped;
  if (typeof unwrapped === 'string') {
    const parsed = safeJsonParse(unwrapped.trim());
    return Array.isArray(parsed) ? parsed : undefined;
  }
  return undefined;
}

function summarizeStructuredOutput(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : JSON.stringify(value, null, 2);
  }
  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    const stdout = typeof data.stdout === 'string' ? data.stdout.trim() : '';
    const stderr = typeof data.stderr === 'string' ? data.stderr.trim() : '';
    const error = typeof data.error === 'string' ? data.error.trim() : '';
    const parts = [];
    if (stdout) parts.push(`stdout:\n${stdout}`);
    if (stderr) parts.push(`stderr:\n${stderr}`);
    if (error) parts.push(`Error: ${error}`);
    return parts.join('\n\n') || JSON.stringify(value, null, 2);
  }
  return String(value ?? '');
}

function formatToolDisplayOutput(actionName: string, output: unknown): string {
  if (output == null) return '';
  const unwrapped = unwrapToolPayload(output);

  if (actionName === 'Search') {
    if (Array.isArray(unwrapped)) return JSON.stringify(unwrapped);
    return valueToDisplayString(unwrapped);
  }
  if (actionName === 'File') {
    return typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped);
  }
  if (actionName === 'Video') {
    return typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped);
  }

  const text = valueToDisplayString(unwrapped);
  const trimmed = text.trim();
  const parsed = safeJsonParse(trimmed);
  if (parsed !== undefined) return summarizeStructuredOutput(parsed);

  const fencedJson = trimmed.match(/^```json\s*([\s\S]*?)\s*```$/i);
  if (fencedJson) {
    const parsedFence = safeJsonParse(fencedJson[1]);
    if (parsedFence !== undefined) return summarizeStructuredOutput(parsedFence);
  }

  return text;
}

function getToolTargetName(toolName: string | undefined, input: unknown): string {
  const unwrapped = unwrapToolPayload(input);
  const data = unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped) ? unwrapped as Record<string, unknown> : {};
  if (toolName === 'search_web') return valueToDisplayString(data.query ?? unwrapped).trim();
  if (toolName === 'browse_web') return valueToDisplayString(data.url ?? unwrapped).trim();
  if (toolName === 'browser_interact') return valueToDisplayString(data.url ?? data.actions ?? unwrapped).trim();
  if (toolName === 'run_terminal') return valueToDisplayString(data.command ?? unwrapped).replace(/\n/g, ' ').trim();
  if (toolName === 'run_python') return 'Python code';
  if (toolName === 'list_sandbox_files') return valueToDisplayString(data.path ?? '/home/user').trim();
  if (toolName === 'get_sandbox_file_url') return valueToDisplayString(data.path ?? unwrapped).trim();
  if (toolName === 'list_e2b_templates') return 'Available templates';
  if (toolName === 'set_e2b_template') return valueToDisplayString(data.template ?? unwrapped).trim();
  if (toolName === 'create_artifact') return valueToDisplayString(data.filename ?? unwrapped).trim();
  if (toolName === 'capability_catalog') return valueToDisplayString(data.query ?? '100 capabilities').trim();
  if (toolName === 'download_video') return valueToDisplayString(data.url ?? unwrapped).trim();
  if (toolName === 'sandbox_browser') return valueToDisplayString(data.url ?? data.actions ?? unwrapped).trim();
  if (toolName === 'spawn_subagent') {
    const task = valueToDisplayString(data.task ?? unwrapped).replace(/\n/g, ' ').trim();
    return task.length > 80 ? task.slice(0, 80) + '…' : task;
  }
  if (toolName === 'spawn_subagents_parallel') {
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    if (tasks.length === 0) return 'parallel workers';
    const previews = tasks
      .slice(0, 3)
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          const item = entry as Record<string, unknown>;
          const text = valueToDisplayString(item.task ?? item.id ?? '').replace(/\n/g, ' ').trim();
          return text.length > 40 ? text.slice(0, 40) + '…' : text;
        }
        return '';
      })
      .filter(Boolean);
    const more = tasks.length > previews.length ? ` (+${tasks.length - previews.length} more)` : '';
    return `${tasks.length} workers — ${previews.join(' | ')}${more}`;
  }
  if (toolName === 'skill_view') return valueToDisplayString(data.name ?? unwrapped).trim();
  if (toolName === 'skill_manage') return valueToDisplayString(data.action ?? data.name ?? 'list').trim();

  const raw = valueToDisplayString(unwrapped);
  return raw.replace(/\n/g, ' ').trim();
}

function splitStreamLines(content: string): string[] {
  return content
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?\u104B])\s+/)
    .map(line => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

function sanitizeAssistantText(content: string): string {
  return stripArtifactLinksFromText(content)
    .replace(/^Error:\s*Recursion limit.*$/gim, '')
    .replace(/^Troubleshooting URL:.*$/gim, '')
    .replace(/For troubleshooting, visit:[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isNoiseAssistantText(content: string): boolean {
  const cleaned = sanitizeAssistantText(content);
  if (!cleaned) return true;
  if (/^Error:\s*(Recursion limit|Graph recursion|GRAPH_RECURSION_LIMIT)/i.test(content.trim())) return true;
  return false;
}

function getToolActivityLine(node: Extract<AiStreamNode, { type: 'tool' }>): string {
  const target = node.targetName ? `: ${node.targetName}` : '';
  if (node.status === 'running') {
    if (node.actionName === 'Search') return `Searching the web${target}`;
    if (node.actionName === 'Browse') return `Opening and reading the page${target}`;
    if (node.actionName === 'Browser') return `Using the browser${target}`;
    if (node.actionName === 'Python') return 'Running Python in the sandbox';
    if (node.actionName === 'Terminal') return `Running terminal command${target}`;
    if (node.actionName === 'E2B') return `Selecting sandbox environment${target}`;
    if (node.actionName === 'Toolbox') return `Choosing the right capability${target}`;
    if (node.actionName === 'File') return `Preparing file result${target}`;
    if (node.actionName === 'Video') return `Downloading video${target}`;
    if (node.actionName === 'Subagent') return `Running subagent${target}`;
    if (node.actionName === 'Workers') return `Running ${node.targetName ? node.targetName : 'parallel workers'}`;
    if (node.actionName === 'Skill') return `Loading skill${target}`;
    return `Working${target}`;
  }

  if (node.actionName === 'Search') return `Search${target}`;
  if (node.actionName === 'Browse') return `Browse${target}`;
  if (node.actionName === 'Browser') return `Browser${target}`;
  if (node.actionName === 'Python') return 'Python';
  if (node.actionName === 'Terminal') return `Terminal${target}`;
  if (node.actionName === 'E2B') return `Sandbox${target}`;
  if (node.actionName === 'Toolbox') return `Capability${target}`;
  if (node.actionName === 'File') return `File${target}`;
  if (node.actionName === 'Video') return `Video${target}`;
  if (node.actionName === 'Subagent') return `Subagent${target}`;
  if (node.actionName === 'Workers') return `Parallel workers${target}`;
  if (node.actionName === 'Skill') return `Skill${target}`;
  return `Tool${target}`;
}

function shouldShowToolDetails(node: Extract<AiStreamNode, { type: 'tool' }>) {
  return node.status === 'done' && node.actionName !== 'Browse';
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * ============================================================================
 * UNIFIED AI BUBBLE
 * ============================================================================
 */



const ReasoningRow: React.FC<{
  node: Extract<AiStreamNode, { type: 'reasoning' }>;
  expanded: boolean;
  isLive: boolean;
  onToggle: () => void;
}> = ({ node, expanded, isLive, onToggle }) => {
  const lines = splitStreamLines(node.content);
  const previewLines = lines.slice(-3);

  return (
    <View style={aiBubbleStyles.actionRowContainer}>
      <TouchableOpacity style={aiBubbleStyles.actionHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={aiBubbleStyles.thinkDot} />
        <View style={aiBubbleStyles.actionHeaderText}>
          <Text style={aiBubbleStyles.actionTitle}>Thinking</Text>
          {expanded ? (
            <ScrollView
              style={aiBubbleStyles.reasoningScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {lines.map((line, index) => (
                <Text key={`${node.id}-detail-${index}`} style={aiBubbleStyles.reasoningLine}>
                  {line}
                </Text>
              ))}
            </ScrollView>
          ) : isLive ? (
            previewLines.map((line, index) => (
              <Text key={`${node.id}-${index}`} style={aiBubbleStyles.previewLine} numberOfLines={1}>
                {line}
              </Text>
            ))
          ) : null}
        </View>
        <SvgChevronRight size={14} color="#9CA3AF" rotation={expanded ? 90 : 0} />
      </TouchableOpacity>
    </View>
  );
};

const ToolRow: React.FC<{
  node: Extract<AiStreamNode, { type: 'tool' }>;
  expanded: boolean;
  isLive: boolean;
  onToggle: () => void;
}> = ({ node, expanded, isLive, onToggle }) => {
  const Icon = node.actionName === 'Search'
    ? SvgSearchIcon
    : node.actionName === 'Terminal'
      ? SvgTerminalIcon
      : SvgExecuteIcon;
  const canExpand = shouldShowToolDetails(node);

  return (
    <View style={aiBubbleStyles.actionRowContainer}>
      <TouchableOpacity style={aiBubbleStyles.actionHeader} onPress={canExpand ? onToggle : undefined} activeOpacity={0.7}>
        <Icon size={14} color={node.status === 'running' ? '#2563EB' : '#6B7280'} />
        <View style={aiBubbleStyles.actionHeaderText}>
          <View style={aiBubbleStyles.toolTitleRow}>
            <Text style={aiBubbleStyles.actionTitle}>{node.actionName}</Text>
            {node.status === 'running' ? <RunningShimmer /> : null}
          </View>
          {node.status === 'running' || isLive ? (
            <ShimmerText style={aiBubbleStyles.previewLine}>{getToolActivityLine(node)}</ShimmerText>
          ) : null}
        </View>
        {canExpand ? <SvgChevronRight size={14} color="#9CA3AF" rotation={expanded ? 90 : 0} /> : null}
      </TouchableOpacity>

      {expanded && canExpand && (
        <ScrollView
          style={aiBubbleStyles.toolDetailsInline}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {node.actionName === 'Search'
            ? <WebSearchCollage output={node.output} />
            : <MarkdownText content={stripArtifactLinksFromText(node.output || '')} mode="reasoning" />
          }
        </ScrollView>
      )}
    </View>
  );
};

/**
 * ============================================================================
 * APPROVAL CARD — Inline command-permission UI
 * ============================================================================
 * Rendered inside the same action pane as reasoning/tool rows when the backend
 * sends an `approval_request`. Tap allow_once / allow_always / reject and the
 * decision is forwarded over the WebSocket via the ApprovalContext.
 */

type ApprovalNode = Extract<AiStreamNode, { type: 'approval' }>;

interface ApprovalContextValue {
  decide: (requestId: string, command: string, decision: 'allow_once' | 'allow_always' | 'reject') => void;
}

const ApprovalContext = React.createContext<ApprovalContextValue | undefined>(undefined);

const RISK_BADGES: Record<ApprovalNode['riskLevel'], { label: string; color: string; bg: string }> = {
  low:    { label: 'Low risk',    color: '#0F766E', bg: 'rgba(16,185,129,0.12)' },
  medium: { label: 'Needs review', color: '#92400E', bg: 'rgba(245,158,11,0.16)' },
  high:   { label: 'High risk',   color: '#991B1B', bg: 'rgba(239,68,68,0.14)' },
};

const STATUS_LABEL: Record<ApprovalNode['status'], string> = {
  pending: 'Awaiting approval',
  allow_once: 'Allowed once',
  allow_always: 'Allowed for this session',
  reject: 'Rejected',
  auto_reject: 'Auto-rejected (high risk)',
  expired: 'Timed out — auto-rejected',
};

const ApprovalCard: React.FC<{ node: ApprovalNode }> = ({ node }) => {
  const ctx = useContext(ApprovalContext);
  const badge = RISK_BADGES[node.riskLevel];
  const isPending = node.status === 'pending';

  return (
    <LiquidGlass variant="regular" borderRadius={14} style={approvalStyles.containerOuter} contentStyle={approvalStyles.container}>
      <View style={approvalStyles.headerRow}>
        <Text style={approvalStyles.title}>Run terminal command?</Text>
        <View style={[approvalStyles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[approvalStyles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      <View style={approvalStyles.commandBox}>
        <Text style={approvalStyles.commandText} selectable numberOfLines={6}>
          {node.command}
        </Text>
      </View>
      {node.reason ? <Text style={approvalStyles.reason}>{node.reason}</Text> : null}
      {isPending ? (
        <View style={approvalStyles.actionRow}>
          <TouchableOpacity
            style={[approvalStyles.btn, approvalStyles.btnReject]}
            onPress={() => ctx?.decide(node.requestId, node.command, 'reject')}
            activeOpacity={0.7}
          >
            <Text style={approvalStyles.btnRejectText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[approvalStyles.btn, approvalStyles.btnAllow]}
            onPress={() => ctx?.decide(node.requestId, node.command, 'allow_once')}
            activeOpacity={0.7}
          >
            <Text style={approvalStyles.btnAllowText}>Allow once</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[approvalStyles.btn, approvalStyles.btnAlways]}
            onPress={() => ctx?.decide(node.requestId, node.command, 'allow_always')}
            activeOpacity={0.7}
          >
            <Text style={approvalStyles.btnAlwaysText}>Allow always</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[approvalStyles.statusLine, node.status === 'reject' || node.status.includes('reject') || node.status === 'expired' ? approvalStyles.statusReject : approvalStyles.statusAllow]}>
          {STATUS_LABEL[node.status]}
        </Text>
      )}
    </LiquidGlass>
  );
};

type SecurityNode = Extract<AiStreamNode, { type: 'security' }>;

const SecurityCard: React.FC<{ node: SecurityNode }> = ({ node }) => {
  const isHigh = node.severity === 'high';
  const where = node.where === 'prompt' ? 'in your message' : 'in tool output';
  const labels = node.labels.length > 0 ? node.labels.join(', ') : 'unspecified';
  return (
    <View style={[securityStyles.container, isHigh ? securityStyles.high : securityStyles.medium]}>
      <View style={securityStyles.headerRow}>
        <Text style={[securityStyles.icon, isHigh ? securityStyles.iconHigh : securityStyles.iconMedium]}>⚠</Text>
        <Text style={securityStyles.title}>Security notice</Text>
        <View style={[securityStyles.badge, isHigh ? securityStyles.badgeHigh : securityStyles.badgeMedium]}>
          <Text style={securityStyles.badgeText}>{node.severity.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={securityStyles.body}>
        Detected possible prompt-injection patterns {where} ({labels}). The agent will treat the suspicious text as untrusted data and continue.
      </Text>
    </View>
  );
};

const AiBubble: React.FC<{ msg: Extract<MessageItem, { type: 'ai' }> }> = ({ msg }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => ({ ...prev, [id]: !(prev[id] ?? false) }));
  };

  const isExpanded = (id: string, defaultVal: boolean) => expanded[id] ?? defaultVal;
  const artifactSources = msg.nodes.flatMap((node) => {
    if (node.type === 'text') return [node.content];
    if (node.type === 'tool' && node.status === 'done' && node.output) {
      // Exclude web search/browse outputs — they contain regular web URLs, not sandbox files
      if (node.actionName === 'Search' || node.actionName === 'Browse' || node.actionName === 'Browser') return [];
      return [node.output];
    }
    return [];
  });
  const liveActionNode = msg.isProcessing
    ? [...msg.nodes].reverse().find((node) => node.type === 'reasoning' || (node.type === 'tool' && node.status === 'running'))
    : undefined;
  const renderActionPane = (nodes: Extract<AiStreamNode, { type: 'reasoning' | 'tool' | 'approval' | 'security' }>[], key: string) => {
    const visibleNodes = nodes.filter((node) => (
      node.type === 'tool' || node.type === 'approval' || node.type === 'security' || node.content.trim().length > 0
    ));
    if (visibleNodes.length === 0) return null;

    const COMPUTER_ACTIONS = new Set(['Browse', 'Browser', 'Python', 'Terminal', 'Video']);
    const toActivity = (n: Extract<AiStreamNode, { type: 'tool' }>): ActivityNode => ({
      id: n.id, actionName: n.actionName, targetName: n.targetName, status: n.status, output: n.output,
    });

    // Render the buffered tool nodes as a single visual unit, choosing the
    // right surface: subagent panel, parallel group, virtual-computer frame,
    // or a plain activity card.
    const renderToolCluster = (toolNodes: Extract<AiStreamNode, { type: 'tool' }>[], clusterKey: string) => {
      if (toolNodes.length === 0) return null;

      // Subagent / parallel-workers always get the dedicated panel.
      const subAgent = toolNodes.find((n) => n.actionName === 'Subagent' || n.actionName === 'Workers');
      if (subAgent && toolNodes.length === 1) {
        return <SubAgentPanel key={clusterKey} node={toActivity(subAgent)} />;
      }

      // 2+ tools buffered together → they ran in parallel.
      if (toolNodes.length >= 2) {
        return <ParallelActivityGroup key={clusterKey} nodes={toolNodes.map(toActivity)} />;
      }

      // Single tool. Computer-type work shows in the virtual computer frame;
      // everything else uses a clean activity card.
      const only = toolNodes[0];
      if (COMPUTER_ACTIONS.has(only.actionName)) {
        return <VirtualComputerFrame key={clusterKey} node={toActivity(only)} />;
      }
      return (
        <ToolActivityCard
          key={clusterKey}
          node={toActivity(only)}
          expanded={isExpanded(only.id, false)}
          onToggle={() => toggle(only.id)}
          renderDetail={(n) => (
            n.actionName === 'Search'
              ? <WebSearchCollage output={n.output} />
              : <MarkdownText content={stripArtifactLinksFromText(n.output || '')} mode="reasoning" />
          )}
        />
      );
    };

    // Walk the pane, batching consecutive tool nodes into clusters while
    // keeping reasoning / approval / security inline in order. Tools are only
    // grouped as "parallel" when they share a batchId (started while another
    // was still running) — sequential tools render as separate units.
    const out: React.ReactNode[] = [];
    let toolBatch: Extract<AiStreamNode, { type: 'tool' }>[] = [];
    let batchIdx = 0;
    const flush = () => {
      if (toolBatch.length > 0) {
        out.push(renderToolCluster(toolBatch, `${key}-tools-${batchIdx++}`));
        toolBatch = [];
      }
    };

    for (const node of visibleNodes) {
      if (node.type === 'tool') {
        // If this tool belongs to a different batch than what's buffered,
        // flush the current batch first so the two don't merge.
        const prev = toolBatch[toolBatch.length - 1];
        if (prev && prev.batchId !== node.batchId) flush();
        toolBatch.push(node);
        continue;
      }
      flush();
      if (node.type === 'reasoning') {
        out.push(
          <ReasoningRow
            key={node.id}
            node={node}
            expanded={isExpanded(node.id, false)}
            isLive={liveActionNode?.id === node.id}
            onToggle={() => toggle(node.id)}
          />
        );
      } else if (node.type === 'security') {
        out.push(<SecurityCard key={node.id} node={node} />);
      } else {
        out.push(<ApprovalCard key={node.id} node={node} />);
      }
    }
    flush();

    return (
      <LiquidGlass key={key} variant="thin" borderRadius={16} style={aiBubbleStyles.actionPane} contentStyle={aiBubbleStyles.actionPaneContent}>
        {out}
      </LiquidGlass>
    );
  };

  const renderedNodes: React.ReactNode[] = [];
  let actionBuffer: Extract<AiStreamNode, { type: 'reasoning' | 'tool' | 'approval' | 'security' }>[] = [];
  let paneIndex = 0;

  msg.nodes.forEach((node) => {
    if (node.type === 'reasoning' || node.type === 'tool' || node.type === 'approval' || node.type === 'security') {
      actionBuffer.push(node);
      return;
    }

    if (actionBuffer.length > 0) {
      renderedNodes.push(renderActionPane(actionBuffer, `actions-${paneIndex}`));
      actionBuffer = [];
      paneIndex += 1;
    }

    const cleaned = sanitizeAssistantText(node.content);
    if (cleaned) {
      renderedNodes.push(
        <View key={node.id} style={{ marginBottom: 8 }}>
          <MarkdownText content={cleaned} mode={msg.mode} />
        </View>
      );
    }
  });

  if (actionBuffer.length > 0) {
    renderedNodes.push(renderActionPane(actionBuffer, `actions-${paneIndex}`));
  }

  return (
    <View style={aiBubbleStyles.container}>
      {msg.nodes.length === 0 && msg.isProcessing ? (
        <TypingIndicator />
      ) : (
        <View style={{ marginTop: 4 }}>
          {msg.isProcessing ? <TypingIndicator /> : <CandleDoneHeader />}

          {renderedNodes}

          {!msg.isProcessing ? <ArtifactResults sources={artifactSources} /> : null}
        </View>
      )}
    </View>
  );
};

const toolStyles = StyleSheet.create({
  collageContainer: {
    backgroundColor: 'transparent',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  divider: {
    height: 0.5,
    backgroundColor: 'rgba(60,60,67,0.08)',
    marginVertical: 12,
    marginHorizontal: 8,
  },
  searchCard: {
    backgroundColor: 'transparent',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  domainIcon: {
    backgroundColor: '#F2F3F5',
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
  },
  searchCardUrl: {
    fontSize: 12,
    fontWeight: '500',
    color: '#636366',
  },
  searchCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 6,
    lineHeight: 22,
  },
  searchCardSnippet: {
    fontSize: 13,
    color: '#636366',
    lineHeight: 20,
  },
  terminalContainer: {
    backgroundColor: '#1C1C1E',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  terminalHeaderText: {
    color: '#AEAEB2',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  terminalBody: {
    maxHeight: 250,
  },
  terminalText: {
    color: '#30D158',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  }
});

const aiBubbleStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 6,
  },
  liveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  liveStatusText: {
    color: '#3C3C43',
    fontSize: 13,
    fontWeight: '600',
  },
  doneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  doneHeaderText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  runningShimmer: {
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#007AFF',
    marginLeft: 7,
  },
  actionPane: {
    marginBottom: 12,
  },
  actionPaneContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionCard: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  actionRowContainer: {
    paddingVertical: 7,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  actionHeaderText: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
  },
  toolTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thinkDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#8E8E93',
    marginTop: 6,
  },
  actionTitle: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  previewLines: {
    marginTop: 2,
  },
  previewLine: {
    color: '#636366',
    fontSize: 12,
    lineHeight: 18,
  },
  reasoningScroll: {
    maxHeight: 140,
    marginTop: 4,
    paddingRight: 6,
  },
  reasoningLine: {
    color: '#3C3C43',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  actionContent: {
    marginTop: 4,
    paddingLeft: 22,
    opacity: 0.85,
  },
  toolTarget: {
    color: '#8E8E93',
    fontSize: 13,
    flexShrink: 1,
    marginRight: 8,
  },
  toolDetailsInline: {
    marginTop: 8,
    paddingLeft: 22,
    maxHeight: ACTION_DETAIL_MAX_HEIGHT,
  }
});

const BACKEND_PORT = 3000;

function toWebSocketUrl(url: string) {
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url.replace(/\/$/, '');
  if (url.startsWith('http://') || url.startsWith('https://')) return url.replace(/^http/, 'ws').replace(/\/$/, '');
  return `ws://${url.replace(/\/$/, '')}`;
}

function getExpoHost() {
  const constants = Constants as typeof Constants & {
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };
  const hostUri = Constants.expoConfig?.hostUri ?? constants.manifest2?.extra?.expoClient?.hostUri ?? constants.manifest?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (!host || host.includes('exp.direct')) return undefined;
  return host;
}

function getWebSocketUrl() {
  const explicitUrl = process.env.EXPO_PUBLIC_WS_URL ?? process.env.EXPO_PUBLIC_BACKEND_URL;
  if (explicitUrl) return toWebSocketUrl(explicitUrl);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.hostname}:${BACKEND_PORT}`;
  }
  const host = getExpoHost() ?? (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
  return `ws://${host}:${BACKEND_PORT}`;
}

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  // Chat uses a plain ScrollView, not FlashList. The conversation is capped
  // (trimChatHistory) and messages STREAM + grow continuously, which makes
  // FlashList v2's recycling mis-measure tall items and overlap them. A
  // ScrollView renders every row at its true height — no recycling, no
  // overlap — which is the right tradeoff for a bounded, streaming transcript.
  const scrollRef = useRef<ScrollView>(null);
  // Mirror of `messages` so we can read the latest conversation synchronously
  // when sending a prompt (state updates are async). The history we send is
  // the source of truth for the backend — it survives reconnects and run
  // cancellations, both of which previously wiped the server-side history.
  const messagesRef = useRef<MessageItem[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const wsUrl = React.useMemo(() => getWebSocketUrl(), []);

  const handleWsMessage = useCallback((data: any) => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];

      // Ensure we are working with an AI message
      if (!last || last.type !== 'ai') {
        if (data.type === 'status' && data.content === 'Agent started...') {
          msgs.push({ id: `ai-${Date.now()}`, type: 'ai', mode: 'normal', nodes: [], isProcessing: true });
        }
        return msgs;
      }

      // We create a fully new object to force React to re-render properly
      const newAiMsg = { ...last, nodes: [...last.nodes] };
      msgs[msgs.length - 1] = newAiMsg;

      if (data.type === 'mode') {
        newAiMsg.mode = data.mode as ChatMode;
        return msgs;
      }

      if (data.type === 'reasoning_chunk') {
        const chunk = String(data.content ?? '');
        if (!chunk.trim()) return msgs;
        let rNode = newAiMsg.nodes[newAiMsg.nodes.length - 1]?.type === 'reasoning'
          ? newAiMsg.nodes[newAiMsg.nodes.length - 1] as Extract<AiStreamNode, { type: 'reasoning' }>
          : undefined;
        if (!rNode) {
          rNode = { type: 'reasoning', id: `r-${Date.now()}`, content: chunk };
          newAiMsg.nodes.push(rNode);
        } else {
          const index = newAiMsg.nodes.indexOf(rNode);
          newAiMsg.nodes[index] = { ...rNode, content: rNode.content + chunk };
        }
        return msgs;
      }

      if (data.type === 'approval_request') {
        const requestId = String(data.requestId ?? '');
        if (!requestId) return msgs;
        // Skip duplicates if the server retransmits.
        if (newAiMsg.nodes.some(n => n.type === 'approval' && n.requestId === requestId)) {
          return msgs;
        }
        newAiMsg.nodes.push({
          type: 'approval',
          id: `appr-${requestId}`,
          requestId,
          command: String(data.command ?? ''),
          riskLevel: (data.riskLevel === 'high' || data.riskLevel === 'low') ? data.riskLevel : 'medium',
          reason: data.reason ? String(data.reason) : undefined,
          status: 'pending',
        });
        return msgs;
      }

      if (data.type === 'security_notice') {
        const severity: SecurityNode['severity'] = data.severity === 'high' ? 'high' : 'medium';
        const where: SecurityNode['where'] = data.where === 'tool' ? 'tool' : 'prompt';
        const labels = Array.isArray(data.labels) ? data.labels.map((l: any) => String(l)).slice(0, 8) : [];
        // Suppress duplicates — same severity + same labels in a row.
        const last = newAiMsg.nodes[newAiMsg.nodes.length - 1];
        if (last && last.type === 'security' && last.severity === severity && last.labels.join('|') === labels.join('|')) {
          return msgs;
        }
        newAiMsg.nodes.push({
          type: 'security',
          id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          severity,
          labels,
          where,
        });
        return msgs;
      }

      if (data.type === 'approval_decision') {
        // Server-side resolution (timeout, cache hit, auto-reject). Reflect it
        // in any pending card so the UI stops showing buttons.
        const command = String(data.command ?? '');
        const source = String(data.source ?? '');
        const decision = String(data.decision ?? '');
        const targetIndex = newAiMsg.nodes.findIndex(n =>
          n.type === 'approval' && n.status === 'pending' && n.command === command
        );
        if (targetIndex >= 0) {
          const node = newAiMsg.nodes[targetIndex] as Extract<AiStreamNode, { type: 'approval' }>;
          let nextStatus: Extract<AiStreamNode, { type: 'approval' }>['status'] = 'reject';
          if (decision === 'allow_once' || decision === 'allow_always') nextStatus = decision;
          else if (source === 'auto') nextStatus = 'auto_reject';
          else if (source === 'timeout') nextStatus = 'expired';
          newAiMsg.nodes[targetIndex] = { ...node, status: nextStatus };
        }
        return msgs;
      }

      if (data.type === 'tool_start') {
        let actionName = 'Executing';
        if (data.toolName === 'search_web') actionName = 'Search';
        else if (data.toolName === 'browse_web') actionName = 'Browse';
        else if (data.toolName === 'browser_interact') actionName = 'Browser';
        else if (data.toolName === 'run_python') actionName = 'Python';
        else if (data.toolName === 'run_terminal') actionName = 'Terminal';
        else if (data.toolName === 'list_e2b_templates' || data.toolName === 'set_e2b_template') actionName = 'E2B';
        else if (data.toolName === 'capability_catalog') actionName = 'Toolbox';
        else if (data.toolName === 'list_sandbox_files' || data.toolName === 'get_sandbox_file_url') actionName = 'File';
        else if (data.toolName === 'create_artifact') actionName = 'File';
        else if (data.toolName === 'download_video') actionName = 'Video';
        else if (data.toolName === 'sandbox_browser') actionName = 'Browser';
        else if (data.toolName === 'spawn_subagent') actionName = 'Subagent';
        else if (data.toolName === 'spawn_subagents_parallel') actionName = 'Workers';
        else if (data.toolName === 'skill_view' || data.toolName === 'skill_manage') actionName = 'Skill';

        const targetRaw = getToolTargetName(data.toolName, data.input);
        const targetName = targetRaw.length > 50 ? targetRaw.slice(0, 50) : targetRaw;

        // Mark tools that start while another is still running as the SAME
        // parallel batch — this is what lets the UI group genuinely
        // concurrent calls (and NOT merge sequential ones). A fresh batch id
        // is minted whenever no tool is currently running.
        const hasRunningTool = newAiMsg.nodes.some(n => n.type === 'tool' && n.status === 'running');
        let batchId: number;
        if (hasRunningTool) {
          const running = newAiMsg.nodes.filter(n => n.type === 'tool' && n.status === 'running') as Extract<AiStreamNode, { type: 'tool' }>[];
          batchId = running[running.length - 1]?.batchId ?? Date.now();
        } else {
          batchId = Date.now();
        }

        newAiMsg.nodes.push({ type: 'tool', id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, actionName, targetName, status: 'running', batchId });
        return msgs;
      }

      if (data.type === 'tool_end') {
        let tNode = newAiMsg.nodes.findLast(n => n.type === 'tool' && n.status === 'running') as Extract<AiStreamNode, { type: 'tool' }> | undefined;
        if (tNode) {
          const index = newAiMsg.nodes.indexOf(tNode);
          const completedNode = { ...tNode, status: 'done' as const, output: formatToolDisplayOutput(tNode.actionName, data.output) };
          newAiMsg.nodes[index] = completedNode;
        }
        return msgs;
      }

      if (data.type === 'thought_chunk') {
        const content = String(data.content ?? '');
        if (!content || isNoiseAssistantText(content)) return msgs;

        let tNode = newAiMsg.nodes.findLast(n => n.type === 'text');
        const isLastNodeText = newAiMsg.nodes.length > 0 && newAiMsg.nodes[newAiMsg.nodes.length - 1].type === 'text';
        
        if (!isLastNodeText) {
          tNode = { type: 'text', id: `txt-${Date.now()}`, content: '' };
          newAiMsg.nodes.push(tNode);
        }

        const index = newAiMsg.nodes.findIndex(n => n.id === tNode!.id);
        newAiMsg.nodes[index] = { ...tNode!, content: tNode!.content + content };
        return msgs;
      }

      if (data.type === 'status' && data.content === 'Agent finished.') {
        newAiMsg.isProcessing = false;
        return msgs;
      }

      if (data.type === 'answer_reset') {
        // Critic-driven revision: the server is replacing the previous final
        // answer. Drop any existing text nodes so only the revision shows.
        newAiMsg.nodes = newAiMsg.nodes.filter((n) => n.type !== 'text');
        return msgs;
      }

      if (data.type === 'error') {
        newAiMsg.isProcessing = false;
        const content = sanitizeAssistantText(String(data.content ?? ''));
        if (content) {
          newAiMsg.nodes.push({ type: 'text', id: `err-${Date.now()}`, content });
        }
        return msgs;
      }

      return msgs;
    });
  }, []);

  const { send, isConnected, state: wsState } = useStableWebSocket({
    url: wsUrl,
    onMessage: handleWsMessage,
    heartbeatInterval: 25_000,
    heartbeatTimeout: 10_000,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 30_000,
  });

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [messages]);

  const handleSendPrompt = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Build the conversation history from what's already on screen. This is
    // the source of truth the backend uses — sending it with every prompt
    // makes the agent robust to (a) a run being cancelled mid-flight by the
    // next prompt and (b) WebSocket reconnects, both of which used to wipe
    // the server's in-memory history and leave the agent with no context.
    const history = messagesRef.current
      .map((m) => {
        if (m.type === 'user') {
          return { role: 'user' as const, content: m.content };
        }
        // Concatenate the AI message's visible text nodes into one turn.
        const textContent = m.nodes
          .filter((n) => n.type === 'text')
          .map((n) => (n as Extract<AiStreamNode, { type: 'text' }>).content)
          .join('')
          .trim();
        return textContent ? { role: 'assistant' as const, content: textContent } : null;
      })
      .filter((m): m is { role: 'user' | 'assistant'; content: string } => m != null);

    setMessages(prev => [
      ...prev,
      { id: `user-${Date.now()}`, type: 'user', content: trimmed },
      // Create the AI placeholder IMMEDIATELY so the "thinking" indicator
      // shows the instant the user sends — no waiting on the server's
      // "Agent started" round-trip. The WS handler reuses this trailing AI
      // bubble for all subsequent events.
      { id: `ai-${Date.now() + 1}`, type: 'ai', mode: 'normal', nodes: [], isProcessing: true },
    ]);
    
    // Smooth scroll to bottom after user sends message
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);

    send({ type: 'prompt', content: trimmed, history });
  }, [send]);

  const renderItem = useCallback(({ item }: { item: MessageItem }) => {
    if (item.type === 'user') return <UserBubble message={item.content} />;
    if (item.type === 'ai') return <AiBubble msg={item} />;
    return null;
  }, []);

  const handleApprovalDecide = useCallback<ApprovalContextValue['decide']>((requestId, command, decision) => {
    // Optimistic UI: mark the card resolved immediately so the user gets
    // instant feedback. The backend's `approval_decision` event would
    // overwrite this if the IDs lined up, but we match by command text too.
    setMessages((prev) => prev.map((message) => {
      if (message.type !== 'ai') return message;
      let mutated = false;
      const nextNodes = message.nodes.map((node) => {
        if (node.type === 'approval' && node.requestId === requestId && node.status === 'pending') {
          mutated = true;
          return { ...node, status: decision };
        }
        return node;
      });
      return mutated ? { ...message, nodes: nextNodes } : message;
    }));
    send({ type: 'approval_response', requestId, decision });
  }, [send]);

  return (
    <ApprovalContext.Provider value={{ decide: handleApprovalDecide }}>
    <SafeAreaView style={styles.safeArea} edges={['right', 'left']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? <WelcomeState /> : <View style={{ height: 24 }} />}
            {messages.map((item) => (
              <View key={item.id}>{renderItem({ item })}</View>
            ))}
          </ScrollView>
          <View style={styles.inputOverlay} pointerEvents="box-none">
            <LinearGradient
              colors={['rgba(251,251,253,0)', 'rgba(251,251,253,0.92)', '#FBFBFD']}
              locations={[0, 0.35, 1]}
              style={styles.gradient}
              pointerEvents="none"
            />
            <InputArea onSubmit={handleSendPrompt} />
          </View>
          {/* Top fade gradient - blurs content under nav */}
          <LinearGradient
            colors={['#FBFBFD', 'rgba(251,251,253,0.92)', 'rgba(251,251,253,0)']}
            locations={[0, 0.6, 1]}
            style={styles.topGradient}
            pointerEvents="none"
          />
          {/* Floating header overlay - no nav bar, just glass cards */}
          <Header title="Candle" onSkillsPress={() => router.push('/skill-suggestions')} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ApprovalContext.Provider>
  );
}

const approvalStyles = StyleSheet.create({
  containerOuter: {
    marginVertical: 6,
  },
  container: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 14, fontWeight: '700', color: '#1C1C1E', flexShrink: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  commandBox: {
    backgroundColor: 'rgba(244,244,246,0.7)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  commandText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12.5,
    lineHeight: 18,
    color: '#1C1C1E',
  },
  reason: { marginTop: 8, fontSize: 12.5, color: '#6B7280' },
  actionRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  btnReject: { backgroundColor: '#FFFFFF', borderColor: 'rgba(239,68,68,0.5)' },
  btnAllow: { backgroundColor: '#1C1C1E', borderColor: '#1C1C1E' },
  btnAlways: { backgroundColor: '#FFFFFF', borderColor: 'rgba(60,60,67,0.25)' },
  btnRejectText: { color: '#B91C1C', fontWeight: '700', fontSize: 13 },
  btnAllowText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  btnAlwaysText: { color: '#1C1C1E', fontWeight: '600', fontSize: 13 },
  statusLine: { marginTop: 10, fontSize: 12, fontWeight: '600' },
  statusAllow: { color: '#0F766E' },
  statusReject: { color: '#B91C1C' },
});

const securityStyles = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginVertical: 6,
  },
  high: {
    backgroundColor: 'rgba(254, 226, 226, 0.6)',
    borderColor: 'rgba(220, 38, 38, 0.35)',
  },
  medium: {
    backgroundColor: 'rgba(254, 243, 199, 0.6)',
    borderColor: 'rgba(217, 119, 6, 0.35)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  icon: { fontSize: 16, fontWeight: '700' },
  iconHigh: { color: '#B91C1C' },
  iconMedium: { color: '#B45309' },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeHigh: { backgroundColor: '#B91C1C' },
  badgeMedium: { backgroundColor: '#B45309' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  body: {
    fontSize: 12,
    lineHeight: 18,
    color: '#3F3F46',
  },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FBFBFD' },
  flex: { flex: 1 },
  body: { flex: 1, position: 'relative', backgroundColor: '#FBFBFD' },
  listContent: { paddingTop: 82, paddingBottom: 210 },
  inputOverlay: { position: 'absolute', bottom: 0, width: '100%' },  gradient: { position: 'absolute', bottom: 0, width: '100%', height: 210 },
  topGradient: { position: 'absolute', top: 0, width: '100%', height: 120, zIndex: 40 },
});
