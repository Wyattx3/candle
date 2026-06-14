/**
 * MCP Servers — list of connected external tool servers. Each card shows the
 * server name, command + tool count, a connect/disconnect toggle, and a status
 * dot. The flame "Add" button pushes the Add MCP Server screen. Pixel-faithful
 * to the Pencil `Screen · MCP Servers` node.
 */
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Puzzle } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface McpServer {
  id: string;
  name: string;
  meta: string;
  connected: boolean;
}

const SERVERS: McpServer[] = [
  { id: 'aws-docs', name: 'aws-docs', meta: 'uvx · 12 tools', connected: true },
  { id: 'github', name: 'github', meta: 'uvx · 28 tools', connected: true },
  { id: 'filesystem', name: 'filesystem', meta: 'npx · 6 tools', connected: true },
  { id: 'postgres', name: 'postgres', meta: 'uvx · disconnected', connected: false },
];

/** The small 44×26 connect toggle that sits on each server card header. */
function ServerToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable
      style={[styles.toggleTrack, on ? styles.toggleOn : styles.toggleOff]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <View style={styles.toggleKnob} />
    </Pressable>
  );
}

function ServerCard({ server, onToggle }: { server: McpServer; onToggle: () => void }) {
  const statusColor = server.connected ? Candle.success : Candle.textTertiary;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Puzzle size={22} color="#9B5DE5" />
        <View style={styles.cardTexts}>
          <Text style={styles.cardName}>{server.name}</Text>
          <Text style={styles.cardMeta}>{server.meta}</Text>
        </View>
        <ServerToggle on={server.connected} onToggle={onToggle} label={server.name} />
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>
          {server.connected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
    </View>
  );
}

export default function McpServersScreen() {
  const router = useRouter();
  const [servers, setServers] = useState(SERVERS);

  const toggleServer = (id: string) =>
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, connected: !s.connected } : s)),
    );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.navBar}>
          <Pressable
            style={styles.backBtn}
            hitSlop={8}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={21} color={Candle.textPrimary} />
          </Pressable>
          <Text style={styles.title}>MCP servers</Text>
          <Pressable
            style={styles.addBtn}
            hitSlop={8}
            onPress={() => router.push('/add-mcp-server')}
            accessibilityRole="button"
            accessibilityLabel="Add server"
          >
            <Plus size={22} color={Candle.textOnAccent} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Connect external tool servers to extend what Candle can do.
          </Text>
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} onToggle={() => toggleServer(server.id)} />
          ))}
        </ScrollView>
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: Candle.textPrimary,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 32,
    gap: 14,
  },
  intro: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.45,
    color: Candle.textSecondary,
  },
  card: {
    borderRadius: 16,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  cardTexts: {
    flex: 1,
    gap: 1,
  },
  cardName: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 14.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  cardMeta: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11.5,
    color: Candle.textTertiary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12,
    fontWeight: '500',
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: Candle.flame,
    justifyContent: 'flex-end',
  },
  toggleOff: {
    backgroundColor: '#D9CFC0',
    justifyContent: 'flex-start',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFDF8',
  },
});
