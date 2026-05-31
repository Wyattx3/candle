/**
 * Skill suggestions review screen.
 *
 * Lists every pending suggestion produced by `mineSkillSuggestions()` on the
 * backend, lets the operator approve (which calls `createSkill`) or reject
 * each one. Inline edits to name / description / tags persist via the
 * approve API. The body editor is intentionally minimalist — the review
 * pattern is "scan, tweak, approve" not "deeply edit".
 *
 * Reachable via `/skill-suggestions` once registered in `_layout.tsx`.
 */

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKEND_PORT = 3000;

interface SkillSuggestion {
  id: string;
  name: string;
  description: string;
  body: string;
  tags: string[];
  clusterSize: number;
  avgToolCalls: number;
  avgDurationMs: number;
  promptSamples: string[];
  toolSequence: string[];
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

function toHttpBase(input?: string): string {
  if (!input) return '';
  if (input.startsWith('http://') || input.startsWith('https://')) return input.replace(/\/$/, '');
  if (input.startsWith('ws://')) return input.replace('ws://', 'http://').replace(/\/$/, '');
  if (input.startsWith('wss://')) return input.replace('wss://', 'https://').replace(/\/$/, '');
  return `http://${input.replace(/\/$/, '')}`;
}

function getBackendBaseUrl(): string {
  const explicit =
    process.env.EXPO_PUBLIC_BACKEND_URL ??
    process.env.EXPO_PUBLIC_WS_URL ??
    undefined;
  if (explicit) return toHttpBase(explicit);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    return `${protocol}://${window.location.hostname}:${BACKEND_PORT}`;
  }
  const constants = Constants as typeof Constants & {
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };
  const hostUri =
    Constants.expoConfig?.hostUri ??
    constants.manifest2?.extra?.expoClient?.hostUri ??
    constants.manifest?.debuggerHost;
  const host = hostUri?.split(':')[0] ?? (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
  return `http://${host}:${BACKEND_PORT}`;
}

export default function SkillSuggestionsScreen() {
  const router = useRouter();
  const baseUrl = getBackendBaseUrl();
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, { name: string; description: string; tags: string }>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/skill-suggestions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSuggestions(json.suggestions ?? []);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const mine = useCallback(
    async (polish: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const url = polish
          ? `${baseUrl}/skill-suggestions/mine?polish=1`
          : `${baseUrl}/skill-suggestions/mine`;
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const summary = await res.json();
        Alert.alert(
          polish ? 'Mined + polished' : 'Mining complete',
          `Scanned ${summary.scannedRuns} runs, found ${summary.clustersFound} clusters, ${summary.newSuggestions} new suggestions queued${
            polish ? ` (${summary.polishedSuggestions} polished)` : ''
          }.`,
        );
        await fetchAll();
      } catch (err: any) {
        setError(err?.message ?? String(err));
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, fetchAll],
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleApprove = async (suggestion: SkillSuggestion) => {
    const editsForId = editing[suggestion.id];
    setBusyId(suggestion.id);
    try {
      const payload: Record<string, unknown> = {};
      if (editsForId?.name && editsForId.name !== suggestion.name) {
        payload.name = editsForId.name.trim();
      }
      if (editsForId?.description && editsForId.description !== suggestion.description) {
        payload.description = editsForId.description.trim();
      }
      if (editsForId?.tags !== undefined) {
        const tags = editsForId.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        if (tags.join(',') !== suggestion.tags.join(',')) payload.tags = tags;
      }
      const res = await fetch(`${baseUrl}/skill-suggestions/${suggestion.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      Alert.alert('Approved', `Skill "${json.name}" registered (${json.status}).`);
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Approval failed', err?.message ?? String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (suggestion: SkillSuggestion) => {
    setBusyId(suggestion.id);
    try {
      const res = await fetch(`${baseUrl}/skill-suggestions/${suggestion.id}/reject`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Reject failed', err?.message ?? String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (suggestion: SkillSuggestion) => {
    setBusyId(suggestion.id);
    try {
      const res = await fetch(`${baseUrl}/skill-suggestions/${suggestion.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Delete failed', err?.message ?? String(err));
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = (s: SkillSuggestion) => {
    const isBusy = busyId === s.id;
    const editsForId = editing[s.id] ?? {
      name: s.name,
      description: s.description,
      tags: s.tags.join(', '),
    };
    const updateEdit = (patch: Partial<typeof editsForId>) =>
      setEditing((prev) => ({ ...prev, [s.id]: { ...editsForId, ...patch } }));

    const statusBadge =
      s.status === 'approved'
        ? { bg: '#DCFCE7', fg: '#166534', label: 'APPROVED' }
        : s.status === 'rejected'
          ? { bg: '#FEE2E2', fg: '#B91C1C', label: 'REJECTED' }
          : { bg: '#FEF3C7', fg: '#B45309', label: 'PENDING' };

    return (
      <View key={s.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.metaText}>cluster {s.clusterSize} · ~{s.avgToolCalls} calls · {(s.avgDurationMs / 1000).toFixed(1)}s</Text>
          <View style={[styles.badge, { backgroundColor: statusBadge.bg }]}>
            <Text style={[styles.badgeText, { color: statusBadge.fg }]}>{statusBadge.label}</Text>
          </View>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={editsForId.name}
          onChangeText={(name) => updateEdit({ name })}
          style={styles.input}
          autoCapitalize="none"
          editable={!isBusy && s.status === 'pending'}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          value={editsForId.description}
          onChangeText={(description) => updateEdit({ description })}
          style={[styles.input, { minHeight: 60 }]}
          multiline
          editable={!isBusy && s.status === 'pending'}
        />

        <Text style={styles.label}>Tags (comma-separated)</Text>
        <TextInput
          value={editsForId.tags}
          onChangeText={(tags) => updateEdit({ tags })}
          style={styles.input}
          autoCapitalize="none"
          editable={!isBusy && s.status === 'pending'}
        />

        <Text style={styles.label}>Tool sequence</Text>
        <Text style={styles.sequence}>{s.toolSequence.join(' → ')}</Text>

        <Text style={styles.label}>Sample prompts</Text>
        {s.promptSamples.map((sample, idx) => (
          <Text key={idx} style={styles.sample}>
            {idx + 1}. {sample}
          </Text>
        ))}

        {s.status === 'pending' ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnReject]}
              onPress={() => handleReject(s)}
              disabled={isBusy}
            >
              <Text style={styles.btnRejectText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnDelete]}
              onPress={() => handleDelete(s)}
              disabled={isBusy}
            >
              <Text style={styles.btnDeleteText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnApprove]}
              onPress={() => handleApprove(s)}
              disabled={isBusy}
            >
              <Text style={styles.btnApproveText}>{isBusy ? '…' : 'Approve & register'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDelete]}
              onPress={() => handleDelete(s)}
              disabled={isBusy}
            >
              <Text style={styles.btnDeleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Skill suggestions</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => mine(false)} disabled={loading} hitSlop={10} style={styles.headerAction}>
              <Text style={[styles.action, loading && styles.actionDisabled]}>Mine</Text>
            </Pressable>
            <Pressable onPress={() => mine(true)} disabled={loading} hitSlop={10} style={styles.headerAction}>
              <Text style={[styles.action, loading && styles.actionDisabled]}>Polish</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.muted}>Loading…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <TouchableOpacity onPress={fetchAll} style={[styles.btn, styles.btnApprove]}>
              <Text style={styles.btnApproveText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : suggestions.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.muted}>No suggestions yet.</Text>
            <Text style={styles.mutedSmall}>
              Run a few agent tasks, then tap "Mine" to generate suggestions.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {suggestions.map(renderItem)}
            <View style={{ height: 60 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBFBFD' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.18)',
  },
  back: { fontSize: 15, color: '#0A84FF', fontWeight: '500' },
  title: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  action: { fontSize: 15, color: '#0A84FF', fontWeight: '600' },
  actionDisabled: { color: 'rgba(10,132,255,0.4)' },
  headerActions: { flexDirection: 'row', gap: 14 },
  headerAction: { paddingVertical: 4 },
  list: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  muted: { color: 'rgba(60,60,67,0.6)' },
  mutedSmall: { color: 'rgba(60,60,67,0.5)', fontSize: 12, textAlign: 'center' },
  error: { color: '#B91C1C', fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.18)',
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaText: { fontSize: 11, color: 'rgba(60,60,67,0.6)' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  label: { fontSize: 11, color: 'rgba(60,60,67,0.6)', marginTop: 8, fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(118,118,128,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1C1C1E',
  },
  sequence: { fontSize: 12, color: '#1C1C1E', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sample: { fontSize: 12, color: '#3F3F46', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1 },
  btnApprove: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  btnApproveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  btnReject: { backgroundColor: '#FFFFFF', borderColor: 'rgba(220,38,38,0.4)' },
  btnRejectText: { color: '#B91C1C', fontWeight: '700', fontSize: 13 },
  btnDelete: { backgroundColor: '#FFFFFF', borderColor: 'rgba(60,60,67,0.25)' },
  btnDeleteText: { color: '#3F3F46', fontWeight: '600', fontSize: 13 },
});
