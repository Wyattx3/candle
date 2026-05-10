import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';

/**
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export type ChatMode = 'normal' | 'reasoning' | 'agent';

interface MarkdownTextProps {
  content: string;
  mode: ChatMode;
}

/**
 * ============================================================================
 * TOKEN PARSER
 * ============================================================================
 * Parses a markdown string into a sequence of typed tokens that the renderer
 * can process without any external library dependency.
 */

type TokenType =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'codeblock'
  | 'codeinline'
  | 'bold'
  | 'italic'
  | 'hr'
  | 'text'
  | 'blank';

interface Token {
  type: TokenType;
  raw: string;
  /** For inline-rich tokens: array of inline spans */
  spans?: InlineSpan[];
  /** For code block: language hint */
  lang?: string;
  /** For numbered list: number */
  num?: number;
}

interface InlineSpan {
  type: 'text' | 'bold' | 'italic' | 'bolditalic' | 'code';
  text: string;
}

/** Parse inline markup within a line of text */
function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  // Regex handles ***bold italic***, **bold**, *italic*, `code`
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/gs;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > cursor) {
      spans.push({ type: 'text', text: line.slice(cursor, match.index) });
    }
    if (match[2]) spans.push({ type: 'bolditalic', text: match[2] });
    else if (match[3]) spans.push({ type: 'bold', text: match[3] });
    else if (match[4]) spans.push({ type: 'italic', text: match[4] });
    else if (match[5]) spans.push({ type: 'code', text: match[5] });
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) spans.push({ type: 'text', text: line.slice(cursor) });
  return spans.length > 0 ? spans : [{ type: 'text', text: line }];
}

/** Tokenize a full markdown string into block tokens */
function tokenize(md: string): Token[] {
  const lines = normalizeMarkdownTables(md).split('\n');
  const tokens: Token[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block fence
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      tokens.push({ type: 'codeblock', raw: codeLines.join('\n'), lang });
      i++;
      continue;
    }

    // Heading 1
    if (/^# /.test(line)) {
      tokens.push({ type: 'heading1', raw: line.slice(2), spans: parseInline(line.slice(2)) });
      i++; continue;
    }
    // Heading 2
    if (/^## /.test(line)) {
      tokens.push({ type: 'heading2', raw: line.slice(3), spans: parseInline(line.slice(3)) });
      i++; continue;
    }
    // Heading 3
    if (/^### /.test(line)) {
      tokens.push({ type: 'heading3', raw: line.slice(4), spans: parseInline(line.slice(4)) });
      i++; continue;
    }
    // HR
    if (/^---+$/.test(line.trim())) {
      tokens.push({ type: 'hr', raw: '' });
      i++; continue;
    }
    // Bullet
    if (/^[\-\*] /.test(line)) {
      tokens.push({ type: 'bullet', raw: line.slice(2), spans: parseInline(line.slice(2)) });
      i++; continue;
    }
    // Numbered list
    const numMatch = line.match(/^(\d+)\. (.*)/);
    if (numMatch) {
      tokens.push({ type: 'numbered', raw: numMatch[2], num: parseInt(numMatch[1], 10), spans: parseInline(numMatch[2]) });
      i++; continue;
    }
    // Blank
    if (line.trim() === '') {
      tokens.push({ type: 'blank', raw: '' });
      i++; continue;
    }
    // Normal text line
    tokens.push({ type: 'text', raw: line, spans: parseInline(line) });
    i++;
  }

  return tokens;
}

function splitTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function normalizeMarkdownTables(md: string) {
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const tableLines: string[] = [];
    while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
      tableLines.push(lines[i]);
      i += 1;
    }

    const header = splitTableCells(tableLines[0] || '');
    const rows = tableLines.slice(1).filter((line) => !isTableSeparator(line));
    rows.forEach((line) => {
      const cells = splitTableCells(line);
      if (cells.length === 0) return;
      if (header.length > 1 && cells.length > 1) {
        const [first, ...rest] = cells;
        const details = rest
          .map((cell, index) => {
            const label = header[index + 1];
            return label ? `${label}: ${cell}` : cell;
          })
          .join(' - ');
        out.push(`- **${first}**${details ? ` - ${details}` : ''}`);
      } else {
        out.push(`- ${cells.join(' - ')}`);
      }
    });
  }

  return out.join('\n');
}

/**
 * ============================================================================
 * FONT THEMES  (per mode)
 * ============================================================================
 *  - normal:    Clean system sans-serif. Light and minimal.
 *  - reasoning: Slightly larger, more structured layout with monospace code.
 *  - agent:     Dense, developer-focused. Monospace code blocks prominent.
 */

const THEME = {
  normal: {
    body:      { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontSize: 15, lineHeight: 23, color: '#1C1C1E' },
    heading1:  { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontSize: 20, fontWeight: '700' as const, color: '#1C1C1E' },
    heading2:  { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontSize: 17, fontWeight: '600' as const, color: '#1C1C1E' },
    heading3:  { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontSize: 15, fontWeight: '600' as const, color: '#374151' },
    code:      { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: '#D63031' },
    codeBlock: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12.5, color: '#E2E8F0', lineHeight: 20 },
    codeBg:    '#1E2130',
    bullet:    '#6B7280',
  },
  reasoning: {
    body:      { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 15.5, lineHeight: 25, color: '#1A1A2E' },
    heading1:  { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 21, fontWeight: '700' as const, color: '#1A1A2E' },
    heading2:  { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 18, fontWeight: '600' as const, color: '#1A1A2E' },
    heading3:  { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 15.5, fontWeight: '600' as const, color: '#374151' },
    code:      { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: '#6366F1' },
    codeBlock: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12.5, color: '#E2E8F0', lineHeight: 20 },
    codeBg:    '#1A1A2E',
    bullet:    '#6366F1',
  },
  agent: {
    body:      { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontSize: 14.5, lineHeight: 22, color: '#111827' },
    heading1:  { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontSize: 19, fontWeight: '700' as const, color: '#111827' },
    heading2:  { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontSize: 16, fontWeight: '700' as const, color: '#111827' },
    heading3:  { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontSize: 14.5, fontWeight: '600' as const, color: '#374151' },
    code:      { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: '#10B981' },
    codeBlock: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: '#A3E635', lineHeight: 18 },
    codeBg:    '#0F172A',
    bullet:    '#10B981',
  },
};

type MarkdownTheme = (typeof THEME)[ChatMode];

/**
 * ============================================================================
 * INLINE RENDERER
 * ============================================================================
 */

const InlineRenderer: React.FC<{ spans: InlineSpan[]; theme: MarkdownTheme }> = ({ spans, theme }) => (
  <Text>
    {spans.map((span, i) => {
      switch (span.type) {
        case 'bold':
          return <Text key={i} style={[theme.body, { fontWeight: '700' }]}>{span.text}</Text>;
        case 'italic':
          return <Text key={i} style={[theme.body, { fontStyle: 'italic' }]}>{span.text}</Text>;
        case 'bolditalic':
          return <Text key={i} style={[theme.body, { fontWeight: '700', fontStyle: 'italic' }]}>{span.text}</Text>;
        case 'code':
          return (
            <Text key={i} style={[theme.code, { backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 4, borderRadius: 4 }]}>
              {span.text}
            </Text>
          );
        default:
          return <Text key={i} style={theme.body}>{span.text}</Text>;
      }
    })}
  </Text>
);

/**
 * ============================================================================
 * MODE BADGE
 * ============================================================================
 */

export const SvgCandle: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#F59E0B' }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    {/* Flame */}
    <Rect x="7" y="2" width="2" height="2" fill={color} />
    <Rect x="6" y="4" width="4" height="2" fill={color} opacity={0.8} />
    <Rect x="7" y="6" width="2" height="1" fill={color} opacity={0.6} />
    
    {/* Body */}
    <Rect x="6" y="7" width="4" height="7" fill="currentColor" opacity={0.2} />
    <Rect x="6" y="7" width="1" height="7" fill="currentColor" opacity={0.4} />
    <Rect x="5" y="14" width="6" height="1" fill="currentColor" opacity={0.5} />
  </Svg>
);

const MODE_BADGE_CONFIG = {
  normal:    { label: 'Chat',      bg: '#F3F4F6', color: '#6B7280', flame: '#FBBF24' },
  reasoning: { label: 'Reasoning', bg: '#EEF2FF', color: '#6366F1', flame: '#818CF8' },
  agent:     { label: 'Agent',     bg: '#ECFDF5', color: '#059669', flame: '#34D399' },
};

export const ModeBadge: React.FC<{ mode: ChatMode }> = ({ mode }) => {
  const { label, color, flame } = MODE_BADGE_CONFIG[mode];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 8, marginLeft: 4 }}>
      <SvgCandle size={14} color={flame} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280', letterSpacing: 0.3, marginLeft: 6 }}>Candle {label} {'>'}</Text>
    </View>
  );
};

/**
 * ============================================================================
 * MAIN MARKDOWN TEXT COMPONENT
 * ============================================================================
 */

const MarkdownTextComponent: React.FC<MarkdownTextProps> = ({ content, mode }) => {
  const theme = THEME[mode];
  const tokens = tokenize(content);

  return (
    <View style={styles.container}>
      {tokens.map((token, index) => {
        switch (token.type) {

          case 'heading1':
            return (
              <View key={index} style={styles.headingRow}>
                <Text style={[styles.heading1Base, theme.heading1]}>
                  {token.spans ? (
                    <InlineRenderer spans={token.spans} theme={theme} />
                  ) : token.raw}
                </Text>
              </View>
            );

          case 'heading2':
            return (
              <View key={index} style={styles.headingRow}>
                <Text style={[styles.heading2Base, theme.heading2]}>
                  {token.spans ? <InlineRenderer spans={token.spans} theme={theme} /> : token.raw}
                </Text>
              </View>
            );

          case 'heading3':
            return (
              <View key={index} style={styles.headingRow}>
                <Text style={[styles.heading3Base, theme.heading3]}>
                  {token.spans ? <InlineRenderer spans={token.spans} theme={theme} /> : token.raw}
                </Text>
              </View>
            );

          case 'bullet':
            return (
              <View key={index} style={styles.bulletRow}>
                <Text style={[styles.bulletDot, { color: theme.bullet }]}>{'\u2022'}</Text>
                <Text style={[theme.body, styles.bulletText]}>
                  {token.spans ? <InlineRenderer spans={token.spans} theme={theme} /> : token.raw}
                </Text>
              </View>
            );

          case 'numbered':
            return (
              <View key={index} style={styles.bulletRow}>
                <Text style={[styles.bulletDot, { color: theme.bullet }]}>{token.num}.</Text>
                <Text style={[theme.body, styles.bulletText]}>
                  {token.spans ? <InlineRenderer spans={token.spans} theme={theme} /> : token.raw}
                </Text>
              </View>
            );

          case 'codeblock':
            return (
              <View key={index} style={[styles.codeBlock, { backgroundColor: theme.codeBg }]}>
                {token.lang ? (
                  <Text style={styles.codeLang}>{token.lang}</Text>
                ) : null}
                <Text style={[theme.codeBlock, styles.codeBlockText]} selectable>
                  {token.raw}
                </Text>
              </View>
            );

          case 'hr':
            return <View key={index} style={styles.hr} />;

          case 'blank':
            return <View key={index} style={styles.blank} />;

          default: // 'text'
            return (
              <Text key={index} style={[theme.body, styles.paragraph]}>
                {token.spans ? <InlineRenderer spans={token.spans} theme={theme} /> : token.raw}
              </Text>
            );
        }
      })}
    </View>
  );
};

MarkdownTextComponent.displayName = 'MarkdownText';

export const MarkdownText = memo(MarkdownTextComponent);

/**
 * ============================================================================
 * STYLES
 * ============================================================================
 */

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  headingRow: {
    marginTop: 12,
    marginBottom: 6,
  },
  heading1Base: {
    marginTop: 4,
    marginBottom: 4,
  },
  heading2Base: {
    marginTop: 2,
    marginBottom: 2,
  },
  heading3Base: {
    marginTop: 2,
    marginBottom: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 15,
    lineHeight: 23,
    marginRight: 10,
    minWidth: 16,
  },
  bulletText: {
    flex: 1,
  },
  paragraph: {
    marginVertical: 2,
  },
  codeBlock: {
    borderRadius: 10,
    padding: 14,
    marginVertical: 10,
    overflow: 'hidden',
  },
  codeBlockText: {
    flexShrink: 1,
  },
  codeLang: {
    color: '#64748B',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hr: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  blank: {
    height: 8,
  },
});
