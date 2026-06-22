/**
 * MarkdownText — renders the LLM's answer text with the lightweight markdown it
 * actually produces: bold, inline code, links, bullet/numbered lists, and
 * headings. The agent's answers are valid markdown, so rendering them as raw
 * `<Text>` leaked `**bold**` and `[label](url)` syntax to the user.
 *
 * Deliberately NOT a full CommonMark engine — just the subset the model emits.
 */
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface MarkdownTextProps {
  content: string;
}

type InlineSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string };

// One regex pass over a line: links `[t](u)`, bold `**t**`, inline code `` `t` ``.
const INLINE_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(line)) !== null) {
    if (m.index > last) spans.push({ kind: 'text', text: line.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ kind: 'link', text: m[1], url: m[2] });
    else if (m[3] !== undefined) spans.push({ kind: 'bold', text: m[3] });
    else if (m[4] !== undefined) spans.push({ kind: 'code', text: m[4] });
    last = m.index + m[0].length;
  }
  if (last < line.length) spans.push({ kind: 'text', text: line.slice(last) });
  return spans;
}

function openUrl(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}

function InlineSpans({ line }: { line: string }) {
  return (
    <>
      {parseInline(line).map((span, i) => {
        if (span.kind === 'bold') return <Text key={i} style={styles.bold}>{span.text}</Text>;
        if (span.kind === 'code') return <Text key={i} style={styles.code}>{span.text}</Text>;
        if (span.kind === 'link') {
          return (
            <Text key={i} style={styles.link} onPress={() => openUrl(span.url)}>
              {span.text}
            </Text>
          );
        }
        return <Text key={i}>{span.text}</Text>;
      })}
    </>
  );
}

interface Block {
  type: 'heading' | 'bullet' | 'numbered' | 'paragraph';
  text: string;
  marker?: string;
  level?: number;
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', text: heading[2], level: heading[1].length });
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1] });
      continue;
    }
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push({ type: 'numbered', text: numbered[2], marker: numbered[1] });
      continue;
    }
    blocks.push({ type: 'paragraph', text: line });
  }
  return blocks;
}

export function MarkdownText({ content }: MarkdownTextProps) {
  const blocks = parseBlocks(content);
  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <Text key={i} style={[styles.base, styles.heading]}>
              <InlineSpans line={block.text} />
            </Text>
          );
        }
        if (block.type === 'bullet' || block.type === 'numbered') {
          return (
            <View key={i} style={styles.listRow}>
              <Text style={[styles.base, styles.listMarker]}>
                {block.type === 'bullet' ? '•' : `${block.marker}.`}
              </Text>
              <Text style={[styles.base, styles.listText]}>
                <InlineSpans line={block.text} />
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} style={styles.base}>
            <InlineSpans line={block.text} />
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  base: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: Candle.textPrimary,
  },
  heading: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  bold: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontWeight: '600',
  },
  code: {
    fontFamily: CandleFontFamilies.mono,
    fontSize: 13.5,
    color: Candle.textSecondary,
  },
  link: {
    color: Candle.flame,
    textDecorationLine: 'underline',
  },
  listRow: {
    flexDirection: 'row',
    gap: 8,
  },
  listMarker: {
    color: Candle.textTertiary,
  },
  listText: {
    flex: 1,
  },
});
